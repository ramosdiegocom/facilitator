import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo, Socket as NetSocket } from "node:net";
import { Mppx, NodeListener, Store, tempo } from "mppx/server";
import { createClient, type Hex, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { Actions, Chain } from "viem/tempo";
import WebSocket from "ws";

const DEFAULT_PROMPT = "Tell me something interesting about streamed payments.";
const DEFAULT_PORT = 3000;
const DEFAULT_PRICE_PER_TOKEN = "0.000075";
const DEFAULT_MAX_DEPOSIT = "1";
const DEFAULT_CURRENCY = "0x20c0000000000000000000000000000000000000";
const WS_PATH = "/flux/ws";
const PRIVATE_KEY_REGEX = /^0x[0-9a-fA-F]{64}$/;

function requireHexKey(name: string, value: string | undefined): Hex {
	if (typeof value !== "string" || PRIVATE_KEY_REGEX.test(value) === false) {
		throw new Error(`${name} must be a 0x-prefixed 64-byte hex private key.`);
	}

	return value as Hex;
}

function toHeaders(nodeRequest: IncomingMessage): Headers {
	const headers = new Headers();

	for (const [key, rawValue] of Object.entries(nodeRequest.headers)) {
		if (rawValue === undefined) {
			continue;
		}
		if (Array.isArray(rawValue)) {
			for (const value of rawValue) {
				headers.append(key, value);
			}
			continue;
		}

		headers.set(key, rawValue);
	}

	return headers;
}

function withHost(pathname: string, request: IncomingMessage): URL {
	const host = request.headers.host ?? `127.0.0.1:${DEFAULT_PORT}`;
	return new URL(pathname, `http://${host}`);
}

function toRequest(nodeRequest: IncomingMessage): Request {
	const url = withHost(nodeRequest.url ?? "/", nodeRequest);
	const method = nodeRequest.method ?? "GET";
	const headers = toHeaders(nodeRequest);
	return new Request(url, { headers, method });
}

async function* generateTokens(prompt: string): AsyncGenerator<string> {
	const words = [
		"You",
		" asked",
		": ",
		`"${prompt}"`,
		"\n\n",
		"This",
		" stream",
		" is",
		" metered",
		" over",
		" a",
		" paid",
		" WebSocket",
		" session.",
		"\n\n",
		"Each",
		" chunk",
		" is",
		" sent",
		" only",
		" after",
		" charge()",
		" succeeds.",
	];

	for (const word of words) {
		yield word;
		await new Promise((resolve) => setTimeout(resolve, 35));
	}
}

const serverPrivateKey = requireHexKey(
	"FLUX_WS_SERVER_PRIVATE_KEY",
	process.env.FLUX_WS_SERVER_PRIVATE_KEY
);
const secretKey = process.env.FLUX_WS_SECRET_KEY;
const port = DEFAULT_PORT;
const autoFund = false;
const pricePerToken = DEFAULT_PRICE_PER_TOKEN;
const maxDeposit = DEFAULT_MAX_DEPOSIT;
const currency = DEFAULT_CURRENCY;

const serverAccount = privateKeyToAccount(serverPrivateKey);
const viemClient = createClient({
	account: serverAccount,
	chain: Chain.testnet,
	pollingInterval: 1000,
	transport: http(),
});

const store = Store.memory();

const mppx = Mppx.create({
	methods: [
		tempo.session({
			account: serverAccount,
			currency,
			getClient: () => viemClient,
			store,
			testnet: true,
		}),
	],
	secretKey,
});

const route = mppx.session({
	amount: pricePerToken,
	unitType: "token",
});

if (autoFund) {
	console.log("Funding WS server account via faucet...");
	await Actions.faucet.fundSync(viemClient, {
		account: serverAccount,
		timeout: 30_000,
	});
}

const wsServer = new WebSocket.Server({ noServer: true });

wsServer.on("connection", (socket: WebSocket, request: IncomingMessage) => {
	const url = withHost(request.url ?? WS_PATH, request);
	const prompt = url.searchParams.get("prompt") ?? DEFAULT_PROMPT;
	const tempoSocket = {
		close(code?: number, reason?: string) {
			return socket.close(code, reason);
		},
		off(
			type: "close" | "error" | "message",
			listener: (...args: unknown[]) => void
		) {
			return socket.off(type, listener);
		},
		on(
			type: "close" | "error" | "message",
			listener: (...args: unknown[]) => void
		) {
			return socket.on(type, listener);
		},
		send(data: string) {
			return socket.send(data);
		},
	};

	tempo.Ws.serve({
		async *generate(stream) {
			for await (const token of generateTokens(prompt)) {
				await stream.charge();
				yield token;
			}
		},
		route,
		socket: tempoSocket,
		store,
		url,
	}).catch((error) => {
		console.error("[ws] session error", error);
		try {
			socket.close(1011, "ws-session-failed");
		} catch {
			// noop
		}
	});
});

const httpServer = createServer(async (request, response) => {
	try {
		const url = withHost(request.url ?? "/", request);

		if (url.pathname === "/api/health") {
			await NodeListener.sendResponse(
				response,
				Response.json({
					endpoint: WS_PATH,
					maxDeposit,
					pricePerToken,
					recipient: serverAccount.address,
					status: "ok",
				})
			);
			return;
		}

		if (url.pathname !== WS_PATH) {
			await NodeListener.sendResponse(
				response,
				new Response("Not found", { status: 404 })
			);
			return;
		}

		const result = await route(toRequest(request));
		if (result.status === 402) {
			await NodeListener.sendResponse(response, result.challenge);
			return;
		}

		await NodeListener.sendResponse(
			response,
			result.withReceipt(
				new Response(
					"Use WebSocket upgrade on /flux/ws for streamed chunks. HTTP is only for 402 probing."
				)
			)
		);
	} catch (error) {
		console.error("[ws] http handler error", error);
		await NodeListener.sendResponse(
			response,
			new Response("Internal server error", { status: 500 })
		);
	}
});

httpServer.on("upgrade", (request, socket: NetSocket, head) => {
	const url = withHost(request.url ?? "/", request);
	if (url.pathname !== WS_PATH) {
		socket.destroy();
		return;
	}

	wsServer.handleUpgrade(request, socket, head, (websocket: WebSocket) => {
		wsServer.emit("connection", websocket, request);
	});
});

httpServer.listen(port, "127.0.0.1", () => {
	const address = httpServer.address() as AddressInfo | null;
	const resolvedPort = address?.port ?? port;

	console.log("WS test server ready");
	console.log(`  Recipient:      ${serverAccount.address}`);
	console.log(`  HTTP health:    http://127.0.0.1:${resolvedPort}/api/health`);
	console.log(`  WS endpoint:    ws://127.0.0.1:${resolvedPort}${WS_PATH}`);
	console.log(`  Price/token:    ${pricePerToken}`);
	console.log(`  Max deposit:    ${maxDeposit}`);
});
