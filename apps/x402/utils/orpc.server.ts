import "server-only";

import { createRouterClient } from "@orpc/server";
import { headers } from "next/headers";
import { NextRequest } from "next/server";
import { appRouter } from "@/app/api/routers";
import { createAdminContext } from "@/app/api/routers/procedures";
import type { OrpcClient } from "@/utils/orpc.types";

export const orpc: OrpcClient = createRouterClient(appRouter, {
	context: async () => {
		const requestHeaders = await headers();
		const request = new NextRequest("http://localhost:3000/rpc", {
			headers: requestHeaders,
		});

		return createAdminContext(request);
	},
});

globalThis.$orpc = orpc;
