import Link from "next/link";
import HomeCodeExample from "./components/home-code-example";

export default function Page() {
	const integrationSteps = [
		{
			title: "1. Request hits your protected route",
			description:
				"When no payment proof is present, return 402 Payment Required with x402 payment details.",
		},
		{
			title: "2. Client pays and retries",
			description:
				"AI agents or HTTP clients sign and submit payment, then retry with the required payment header.",
		},
		{
			title: "3. Verify before serving",
			description:
				"Call the x402 verify endpoint to confirm amount, recipient, and signature integrity.",
		},
		{
			title: "4. Return data and settle",
			description:
				"Serve the protected response after verification and settle the payment in your preferred flow.",
		},
	] as const;

	return (
		<div className="mx-auto w-full max-w-6xl px-6 py-14 sm:py-20">
			<div className="mb-6 rounded-3xl border border-slate-200 bg-linear-to-b from-white via-white to-slate-50 p-8 shadow-sm sm:p-12">
				<p className="font-medium text-primary text-sm">x402 API</p>
				<h1 className="mt-3 max-w-4xl font-semibold text-3xl text-slate-900 leading-tight sm:text-5xl">
					Accept micropayments on your API routes with a standard 402 flow.
				</h1>
				<p className="mt-4 max-w-3xl text-slate-600 text-sm leading-6 sm:text-base">
					x402 is a facilitator API for payment-gated HTTP resources. It helps
					you return machine-readable payment requirements, verify signatures,
					and serve paid responses to clients and AI agents in a consistent way.
				</p>

				<div className="mt-8 flex flex-wrap gap-3">
					<Link
						className="inline-flex h-10 items-center justify-center rounded-4xl bg-primary px-4 font-medium text-primary-foreground text-sm transition hover:bg-primary/80"
						href="/dashboard"
					>
						Open Dashboard
					</Link>
					<Link
						className="inline-flex h-10 items-center justify-center rounded-4xl border border-border bg-input/30 px-4 font-medium text-foreground text-sm transition hover:bg-input/50"
						href="/playground"
					>
						Try Playground
					</Link>
					<Link
						className="inline-flex h-10 items-center justify-center rounded-4xl border border-border bg-input/30 px-4 font-medium text-foreground text-sm transition hover:bg-input/50"
						href="https://x402.ramosdiego.com/v2"
						target="_blank"
					>
						Read API Docs
					</Link>
				</div>
			</div>

			<div className="mb-6 grid gap-4 sm:grid-cols-2">
				<div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
					<h2 className="font-semibold text-slate-900 text-xl">
						Who this is for
					</h2>
					<p className="mt-3 text-slate-600 text-sm leading-6">
						API builders, platform teams, and agent-first products that need
						programmable paywalls for data, compute, or premium endpoints.
					</p>
				</div>
				<div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
					<h2 className="font-semibold text-slate-900 text-xl">
						What it is for
					</h2>
					<p className="mt-3 text-slate-600 text-sm leading-6">
						Monetize requests per call: protect private APIs, meter high-value
						inference endpoints, and unlock paid content through standard HTTP
						payment semantics.
					</p>
				</div>
			</div>

			<div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
				<h2 className="mb-1 font-semibold text-2xl text-slate-900">
					How to use x402 API
				</h2>
				<p className="mb-3 max-w-3xl text-slate-600 text-sm leading-6 sm:text-base">
					Implement the payment flow in four steps. The protocol stays familiar:
					HTTP request, 402 challenge, signed payment, verification, then
					resource delivery.
				</p>

				<div className="grid gap-4 sm:grid-cols-2">
					{integrationSteps.map((step) => (
						<div
							className="rounded-xl border border-slate-200 bg-slate-50 p-4"
							key={step.title}
						>
							<h3 className="font-medium text-slate-900 text-sm">
								{step.title}
							</h3>
							<p className="mt-2 text-slate-600 text-sm leading-6">
								{step.description}
							</p>
						</div>
					))}
				</div>
			</div>

			<div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-3">
				<h2 className="font-semibold text-slate-900 text-xl">
					Protect a route in minutes
				</h2>
				<p className="mt-3 text-slate-600 text-sm leading-6">
					Start with a 402 response fallback, then verify incoming payment proof
					before serving your response.
				</p>
				<HomeCodeExample />
			</div>

			<div className="rounded-2xl border border-slate-200 bg-slate-900 px-6 py-8 text-slate-100 shadow-sm sm:px-8">
				<h2 className="font-semibold text-2xl">
					Build pay-per-request products
				</h2>
				<p className="mt-3 max-w-3xl text-slate-300 text-sm leading-6 sm:text-base">
					Use x402 to monetize API access, automate payment by agent clients,
					and keep your existing HTTP architecture while introducing on-chain
					payment rails.
				</p>
				<div className="mt-6 flex flex-wrap gap-3">
					<Link
						className="inline-flex h-10 items-center justify-center rounded-4xl bg-white px-4 font-medium text-slate-900 text-sm transition hover:bg-slate-200"
						href="/dashboard"
					>
						Start Building
					</Link>
					<Link
						className="inline-flex h-10 items-center justify-center rounded-4xl border border-slate-600 px-4 font-medium text-slate-100 text-sm transition hover:bg-slate-800"
						href="https://x402.ramosdiego.com/v2"
						target="_blank"
					>
						View Reference
					</Link>
				</div>
			</div>
		</div>
	);
}
