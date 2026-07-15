import { env } from "@ramoz/env/finance";
import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { parseUnits } from "viem";
import type { SupportedChainCAIP2 } from "@/app/api/routers/chains";
import { ARC_USDC_ADDRESS } from "@/lib/constants";

const PROD_X402_FACILITATOR_BASE_URL = "https://x402.ramosdiego.com/v2";
const DEV_X402_FACILITATOR_BASE_URL = "http://localhost:3000/v2";

export const X402_FACILITATOR_BASE_URL =
	env.NODE_ENV === "production"
		? PROD_X402_FACILITATOR_BASE_URL
		: DEV_X402_FACILITATOR_BASE_URL;

export const facilitatorClient = new HTTPFacilitatorClient({
	url: X402_FACILITATOR_BASE_URL,
	createAuthHeaders: async () => ({
		verify: { Authorization: `Bearer ${env.FACILITATOR_API_KEY}` },
		settle: { Authorization: `Bearer ${env.FACILITATOR_API_KEY}` },
		supported: {},
	}),
});

// Create x402 resource server
export const x402Server = new x402ResourceServer(facilitatorClient);

// Register schemes
x402Server.register(
	"eip155:5042002" satisfies SupportedChainCAIP2,
	new ExactEvmScheme().registerMoneyParser(async (amount) => ({
		amount: parseUnits(`${amount}`, 6).toString(),
		// FIXES (Error: No default asset configured for network eip155:5042002)
		asset: ARC_USDC_ADDRESS,
		// Required by EIP-3009 signing when no signed-offer extension is present.
		extra: { token: "USDC", name: "USDC", version: "2" },
	}))
);
x402Server.register(
	"eip155:8453" satisfies SupportedChainCAIP2,
	new ExactEvmScheme()
);
x402Server.register(
	"eip155:84532" satisfies SupportedChainCAIP2,
	new ExactEvmScheme()
);
