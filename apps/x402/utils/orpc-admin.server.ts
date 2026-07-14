import "server-only";

import { createRouterClient } from "@orpc/server";
import { headers } from "next/headers";
import { NextRequest } from "next/server";
import { adminRouter } from "@/app/api/routers/admin";
import { createAdminContext } from "@/app/api/routers/procedures";

export const adminOrpcServer = createRouterClient(adminRouter, {
	context: async () => {
		const requestHeaders = await headers();
		const request = new NextRequest("http://localhost:3000/api/admin", {
			headers: requestHeaders,
		});

		return createAdminContext(request);
	},
});
