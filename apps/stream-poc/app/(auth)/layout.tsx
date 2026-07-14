import { Wireframe, WireframeNav } from "@ramoz/ui/components/wireframe";

export default function AuthLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<Wireframe>
			<WireframeNav
				className="border-slate-200 border-b bg-background/80 backdrop-blur"
				position="top"
			>
				<div className="mx-auto flex h-full w-full max-w-5xl items-center px-4 sm:px-6">
					<div className="font-bold tracking-wide">x402.diegolosramos.com</div>
				</div>
			</WireframeNav>

			<main className="mx-auto flex w-full max-w-5xl items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
				<div className="w-full max-w-md rounded-2xl border border-slate-200 bg-background p-6 shadow-sm sm:p-8">
					{children}
				</div>
			</main>
		</Wireframe>
	);
}
