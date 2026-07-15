import { env } from "@ramoz/env/finance";
import { type Address, privateKeyToAccount } from "viem/accounts";

const serverAccount = privateKeyToAccount(env.PRIVATE_KEY as Address);

export const fluxConfig = {
	maxDeposit: "1",
	maxTokens: "60",
	pricePerToken: "0.000075",
	currency: "0x20c0000000000000000000000000000000000000",
	unitType: "token",
	secretKey: env.PRIVATE_KEY,
	ssePath: "/flux/sse",
	serverAccount,
} as const;
