import { Mppx, tempo } from "mppx/server";
import { fluxConfig } from "@/app/flux/_server/config";
import { fluxStore, fluxViemClient } from "@/app/flux/_server/state";

export const fluxMppx = Mppx.create({
	secretKey: fluxConfig.secretKey,
	methods: [
		tempo.session({
			account: fluxConfig.serverAccount,
			currency: fluxConfig.currency,
			feePayer: true,
			getClient: () => fluxViemClient,
			store: fluxStore,
			sse: true,
			testnet: true,
		}),
	],
});

export const fluxSessionHandler = fluxMppx.session({
	amount: fluxConfig.pricePerToken,
	unitType: fluxConfig.unitType,
});
