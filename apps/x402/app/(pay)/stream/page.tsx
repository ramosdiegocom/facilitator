import { connection } from "next/server";
import { StreamDemo } from "@/app/(pay)/stream/stream-demo";

export const dynamic = "force-dynamic";

export default async function StreamPage() {
	await connection();
	return <StreamDemo />;
}
