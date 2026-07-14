import { connection } from "next/server";
import { WsDemoClient } from "@/app/(pay)/ws/ws-demo-client";

export const dynamic = "force-dynamic";

export default async function WsDemoPage() {
	await connection();
	return <WsDemoClient />;
}
