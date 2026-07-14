import Link from "next/link";

export default function ProtectedPage() {
	return (
		<div className="min-h-screen bg-[radial-gradient(circle_at_12%_16%,#bae6fd,transparent_35%),radial-gradient(circle_at_86%_24%,#fde68a,transparent_32%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)] px-4 py-10">
			<div className="mx-auto w-full max-w-4xl space-y-6">
				<div className="rounded-3xl border border-slate-200/80 bg-white/90 p-7 shadow-xl backdrop-blur">
					<p className="font-semibold text-[11px] text-emerald-600 uppercase tracking-[0.22em]">
						Protected Example
					</p>
					<h1 className="mt-2 font-semibold text-3xl text-slate-900 tracking-tight">
						Access Granted
					</h1>
					<p className="mt-3 text-slate-700 text-sm leading-relaxed">
						Your payment was successful. This page represents content unlocked
						after an x402-protected request.
					</p>
					<Link
						className="mt-4 inline-flex rounded-xl border border-slate-300 bg-white px-4 py-2 font-medium text-slate-800 text-sm transition hover:bg-slate-50"
						href="/playground"
					>
						Back to /playground
					</Link>
				</div>

				<div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg">
					<p className="font-semibold text-slate-900 text-sm">
						Celebration track
					</p>
					<p className="mt-1 text-slate-600 text-xs">
						Enjoy the song after unlocking access.
					</p>
					<div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
						<iframe
							allow="autoplay"
							height="320"
							src="https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/tracks/2044190296&color=%23ff5500&auto_play=true&hide_related=false&show_comments=true&show_user=true&show_reposts=false&show_teaser=true&visual=true"
							title="x402 SoundCloud player"
							width="100%"
						/>
					</div>
					<div className="mt-3 text-[10px] text-slate-400">
						<a
							className="hover:underline"
							href="https://soundcloud.com/dan-kim-675678711"
							rel="noopener noreferrer"
							target="_blank"
							title="danXkim"
						>
							danXkim
						</a>{" "}
						·{" "}
						<a
							className="hover:underline"
							href="https://soundcloud.com/dan-kim-675678711/x402"
							rel="noopener noreferrer"
							target="_blank"
							title="x402 (DJ Reppel Remix)"
						>
							x402 (DJ Reppel Remix)
						</a>
					</div>
				</div>
			</div>
		</div>
	);
}
