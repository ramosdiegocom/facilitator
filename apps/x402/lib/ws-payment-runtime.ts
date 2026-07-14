import type { IncomingMessage, ServerResponse } from "node:http";
import type { Socket as NetSocket } from "node:net";
import { Mppx, NodeListener, Store, tempo } from "mppx/server";
import { createClient, type Hex, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { Chain } from "viem/tempo";
import WebSocket from "ws";

const DEFAULT_PROMPT = "Explain why WebSocket metering is useful.";
const DEFAULT_PRICE_PER_TOKEN = "0.000075";
const DEFAULT_CURRENCY = "0x20c0000000000000000000000000000000000000";
const PRIVATE_KEY_REGEX = /^0x[0-9a-fA-F]{64}$/;
const WS_PATH = "/flux/ws";

export type WsPaymentRuntime = {
	handleHttpRequest(
		nodeRequest: IncomingMessage,
		nodeResponse: ServerResponse
	): Promise<boolean>;
	handleUpgrade(
		nodeRequest: IncomingMessage,
		socket: NetSocket,
		head: Buffer
	): boolean;
};

function requireHexKey(name: string, value: string | undefined): Hex {
	if (typeof value !== "string" || PRIVATE_KEY_REGEX.test(value) === false) {
		throw new Error(`${name} must be a 0x-prefixed 64-byte hex private key.`);
	}

	return value as Hex;
}

function withHost(pathname: string, request: IncomingMessage): URL {
	const host = request.headers.host ?? "127.0.0.1:3000";
	return new URL(pathname, `http://${host}`);
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

function toRequest(nodeRequest: IncomingMessage): Request {
	const url = withHost(nodeRequest.url ?? "/", nodeRequest);
	const headers = toHeaders(nodeRequest);
	const method = nodeRequest.method ?? "GET";
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

export function createWsPaymentRuntime(): WsPaymentRuntime {
	const serverPrivateKey = requireHexKey(
		"FLUX_WS_SERVER_PRIVATE_KEY",
		process.env.FLUX_WS_SERVER_PRIVATE_KEY
	);
	const secretKey =
		process.env.FLUX_WS_SECRET_KEY ??
		`ws-${serverPrivateKey.slice(2, 18)}-${serverPrivateKey.slice(-8)}`;
	const currency = process.env.FLUX_WS_CURRENCY ?? DEFAULT_CURRENCY;
	const pricePerToken =
		process.env.FLUX_WS_PRICE_PER_TOKEN ?? DEFAULT_PRICE_PER_TOKEN;

	const serverAccount = privateKeyToAccount(serverPrivateKey);
	const viemClient = createClient({
		account: serverAccount,
		chain: Chain.testnet,
		pollingInterval: 1000,
		transport: http(),
	});

	const store = Store.memory();
	const wsServer = new WebSocket.Server({ noServer: true });

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

	wsServer.on(
		"connection",
		(socket: WebSocket, nodeRequest: IncomingMessage) => {
			const url = withHost(nodeRequest.url ?? WS_PATH, nodeRequest);
			const prompt = url.searchParams.get("prompt") ?? DEFAULT_PROMPT;

			tempo.Ws.serve({
				async *generate(stream) {
					for await (const token of generateTokens(prompt)) {
						await stream.charge();
						yield token;
					}
				},
				route,
				socket: {
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
				},
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
		}
	);

	return {
		handleHttpRequest: async (
			nodeRequest: IncomingMessage,
			nodeResponse: ServerResponse
		) => {
			const url = withHost(nodeRequest.url ?? "/", nodeRequest);

			if (url.pathname === "/api/health") {
				await NodeListener.sendResponse(
					nodeResponse,
					Response.json({
						endpoint: WS_PATH,
						pricePerToken,
						recipient: serverAccount.address,
						status: "ok",
					})
				);
				return true;
			}

			if (url.pathname !== WS_PATH) {
				return false;
			}

			const result = await route(toRequest(nodeRequest));
			if (result.status === 402) {
				await NodeListener.sendResponse(nodeResponse, result.challenge);
				return true;
			}

			await NodeListener.sendResponse(
				nodeResponse,
				result.withReceipt(
					new Response(
						"Use WebSocket upgrade on /flux/ws for streamed chunks. HTTP is only for 402 probing."
					)
				)
			);
			return true;
		},
		handleUpgrade: (
			nodeRequest: IncomingMessage,
			socket: NetSocket,
			head: Buffer
		) => {
			const url = withHost(nodeRequest.url ?? "/", nodeRequest);
			if (url.pathname !== WS_PATH) {
				return false;
			}

			wsServer.handleUpgrade(
				nodeRequest,
				socket,
				head,
				(websocket: WebSocket) => {
					wsServer.emit("connection", websocket, nodeRequest);
				}
			);
			return true;
		},
	};
}
