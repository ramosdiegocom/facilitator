import { cookieStorage, createConfig, createStorage, http } from "wagmi";
import { arcTestnet } from "wagmi/chains";
import { injected } from "wagmi/connectors";

const chains = [arcTestnet] as const;

const config = createConfig({
	chains,
	connectors: [injected()],
	storage: createStorage({
		storage: cookieStorage,
	}),
	ssr: true,
	transports: {
		[arcTestnet.id]: http(),
	},
});

export function getConfig() {
	return config;
}
