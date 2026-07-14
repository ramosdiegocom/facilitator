import { tempo } from "mppx/client";
import { createClient, type Hex, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { Actions, Chain } from "viem/tempo";

const DEFAULT_BASE_URL = "http://127.0.0.1:3000";
const DEFAULT_MAX_DEPOSIT = "1";
const DEFAULT_PROMPT = "Explain why WebSocket metering is useful.";
const DEFAULT_CURRENCY = "0x20c0000000000000000000000000000000000000";
const PRIVATE_KEY_REGEX = /^0x[0-9a-fA-F]{64}$/;

function requireHexKey(name: string, value: string | undefined): Hex {
	if (typeof value !== "string" || PRIVATE_KEY_REGEX.test(value) === false) {
		throw new Error(`${name} must be a 0x-prefixed 64-byte hex private key.`);
	}

	return value as Hex;
}

function toWsUrl(baseUrl: string, prompt: string): URL {
	const url = new URL(baseUrl);
	url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
	url.pathname = "/flux/ws";
	url.searchParams.set("prompt", prompt);
	return url;
}

const clientPrivateKey = requireHexKey(
	"FLUX_WS_CLIENT_PRIVATE_KEY",
	process.env.FLUX_WS_CLIENT_PRIVATE_KEY
);

const baseUrl = DEFAULT_BASE_URL;
const maxDeposit = DEFAULT_MAX_DEPOSIT;
const prompt = process.argv.slice(2).join(" ") || DEFAULT_PROMPT;
const autoFund = false;
const currency = DEFAULT_CURRENCY;

const account = privateKeyToAccount(clientPrivateKey);
const client = createClient({
	account,
	chain: Chain.testnet,
	pollingInterval: 1000,
	transport: http(),
});

if (autoFund) {
	console.log("Funding WS client account via faucet...");
	await Actions.faucet.fundSync(client, {
		account,
		timeout: 30_000,
	});
}

const tokenBalanceBefore = await Actions.token.getBalance(client, {
	account,
	token: currency,
});

const wsUrl = toWsUrl(baseUrl, prompt);
const session = tempo.session({
	account,
	client,
	maxDeposit,
	webSocket: WebSocket,
});

console.log("WS test client started");
console.log(`  Payer:          ${account.address}`);
console.log(`  Endpoint:       ${wsUrl.toString()}`);
console.log(`  Max deposit:    ${maxDeposit}`);

let receiptCount = 0;
let tokenCount = 0;

const socket = await session.ws(wsUrl, {
	onReceipt(receipt) {
		receiptCount += 1;
		console.log(
			`\n[receipt ${receiptCount}] accepted=${receipt.acceptedCumulative} spent=${receipt.spent}`
		);
	},
});

console.log("\n--- Stream output ---");

await new Promise<void>((resolve, reject) => {
	socket.addEventListener("message", (event) => {
		if (typeof event.data !== "string") {
			return;
		}
		tokenCount += 1;
		process.stdout.write(event.data);
	});

	socket.addEventListener(
		"close",
		() => {
			resolve();
		},
		{ once: true }
	);

	socket.addEventListener(
		"error",
		() => {
			reject(new Error("WebSocket stream failed."));
		},
		{ once: true }
	);
});

const closeReceipt = await session.close();
const tokenBalanceAfter = await Actions.token.getBalance(client, {
	account,
	token: currency,
});

console.log("\n\n--- Session summary ---");
console.log(`  Tokens streamed: ${tokenCount}`);
console.log(`  Voucher total:   ${session.cumulative.toString()}`);
console.log(`  Balance before:  ${tokenBalanceBefore.toString()}`);
console.log(`  Balance after:   ${tokenBalanceAfter.toString()}`);
console.log(
	`  Balance delta:   ${(tokenBalanceBefore - tokenBalanceAfter).toString()}`
);

if (closeReceipt) {
	console.log(`  Closed channel:  ${closeReceipt.channelId}`);
	if (closeReceipt.txHash) {
		console.log(`  Settlement tx:   ${closeReceipt.txHash}`);
	}
}
