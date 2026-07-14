import type { RouterClient } from "@orpc/server";
import type { AppRouter } from "@/app/api/routers";

export type OrpcClient = RouterClient<AppRouter>;

declare global {
	var $orpc: OrpcClient | undefined;
}
