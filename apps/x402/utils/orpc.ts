import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { OrpcClient } from "@/utils/orpc.types";

const link = new RPCLink({
	url: () => {
		if (typeof window === "undefined") {
			throw new Error("RPCLink is not allowed on the server side.");
		}

		return `${window.location.origin}/rpc`;
	},
});

/**
 * Fallback to client-side client if server-side client is not available.
 */
export const orpc: OrpcClient = globalThis.$orpc ?? createORPCClient(link);
