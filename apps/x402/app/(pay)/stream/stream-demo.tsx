import { PaidSessionStreamDemo } from "@/app/(pay)/stream/paid-session-stream-demo";
import { PlainTextStreamDemo } from "@/app/(pay)/stream/plain-text-stream-demo";

export function StreamDemo() {
	return (
		<div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
			<PlainTextStreamDemo />
			<PaidSessionStreamDemo />
		</div>
	);
}
