import { privateKeyToAccount } from "viem/accounts";

const privateKey = process.env.PRIVATE_KEY;
const serverAccount = privateKeyToAccount(privateKey);

export const fluxConfig = {
	maxDeposit: "1",
	maxTokens: "60",
	pricePerToken: "0.000075",
	currency: "0x20c0000000000000000000000000000000000000",
	unitType: "token",
	secretKey: privateKey,
	ssePath: "/flux/sse",
	serverAccount,
} as const;
