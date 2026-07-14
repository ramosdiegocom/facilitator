import Link from "next/link";
export default function PlaygroundHomePage() {
	return (
		<div className="min-h-screen bg-[radial-gradient(circle_at_12%_16%,#dbeafe,transparent_34%),radial-gradient(circle_at_88%_24%,#fef3c7,transparent_30%),linear-gradient(180deg,#f3f4f6_0%,#e5e7eb_100%)] px-4 py-10">
			<div className="mx-auto w-full max-w-4xl space-y-6">
				<div>
					<p className="font-semibold text-[11px] text-slate-500 uppercase tracking-[0.22em]">
						x402 Playground
					</p>
					<h1 className="mt-2 font-semibold text-3xl text-slate-900 tracking-tight">
						Payment Flows
					</h1>
				</div>

				<div className="grid gap-4 sm:grid-cols-2">
					<Link
						className="group rounded-2xl border border-slate-300 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
						href="/playground/weather"
					>
						<div className="font-semibold text-slate-900">
							Pay for an API call
						</div>
						<p className="mt-2 text-slate-600 leading-relaxed">
							Simulate a common use case of paying to access a protected API,
							such as a weather endpoint.
						</p>
					</Link>

					<Link
						className="group rounded-2xl border border-slate-300 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
						href="/playground/protected"
					>
						<div className="font-semibold text-slate-900">
							Pay to access a protected page
						</div>
						<p className="mt-2 text-slate-600 leading-relaxed">
							The page remains locked until payment is settled, at which point
							the protected content is revealed.
						</p>
					</Link>
				</div>
			</div>
		</div>
	);
}
