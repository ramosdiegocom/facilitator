import Link from "next/link";
import Pay from "./pay";

export default function PayPage() {
	return (
		<div className="space-y-4">
			<div className="mx-auto flex w-full max-w-xl flex-wrap gap-3 px-4 pt-4">
				<Link
					className="text-blue-600 text-sm underline"
					href="/pay/simple-hash"
				>
					Open Simplest Tx Hash Flow
				</Link>
				<Link className="text-blue-600 text-sm underline" href="/pay/simulated">
					Open simulated 402 Flow (No Endpoint Call)
				</Link>

				<Link
					className="text-blue-600 text-sm underline"
					href="/pay/simulated-with-endpoint"
				>
					Open simulated 402 Flow (With Endpoint Call)
				</Link>
				<Link
					className="text-blue-600 text-sm underline"
					href="/pay/attestation"
				>
					Open Browser E2E Receipt Attestation
				</Link>
			</div>
			<Pay />
		</div>
	);
}
