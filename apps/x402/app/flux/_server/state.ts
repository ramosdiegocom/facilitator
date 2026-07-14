import { Store } from "mppx/server";
import { createClient, http } from "viem";
import { Chain } from "viem/tempo";
import { fluxConfig } from "@/app/flux/_server/config";

export const fluxStore = Store.memory();

export const fluxViemClient = createClient({
	account: fluxConfig.serverAccount,
	chain: Chain.testnet,
	pollingInterval: 1000,
	transport: http(),
});
