"use client";

import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import type { adminRouter } from "@/app/api/routers/admin";

const link = new RPCLink({
	url: () => {
		if (typeof window === "undefined") {
			throw new Error("Admin oRPC client is only available in the browser.");
		}

		return `${window.location.origin}/api/admin`;
	},
});

export type AdminOrpcClient = RouterClient<typeof adminRouter>;

export const adminOrpc: AdminOrpcClient = createORPCClient(link);
