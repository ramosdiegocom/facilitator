"use client";

import { useDisconnect, useEnsName } from "wagmi";

export function Connection({ address }: { address?: `0x${string}` }) {
	const { disconnect } = useDisconnect();
	const { data: ensName } = useEnsName({ address });

	return (
		<div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
			<div className="text-slate-600 text-xs">Connected wallet</div>
			{address && (
				<div className="mt-1 break-all font-mono text-[12px] text-slate-900">
					{ensName ? `${ensName} (${address})` : address}
				</div>
			)}
			<button
				className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-2 font-medium text-slate-800 text-sm transition hover:bg-slate-100"
				onClick={() => disconnect()}
				type="button"
			>
				Disconnect wallet
			</button>
		</div>
	);
}
