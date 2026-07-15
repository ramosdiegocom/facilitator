"use client";

import Link from "next/link";
import { useChainId } from "wagmi";
import { arcTestnet } from "wagmi/chains";
import { Connection } from "@/app/(pay)/pay/connection";
import { WalletOptions } from "@/app/(pay)/pay/wallet-options";

const facilitatorUrl = "https://x402.ramosdiego.com/v2";

export function ConnectWallet({
	address,
	isConnected,
}: {
	address?: `0x${string}`;
	isConnected: boolean;
}) {
	const chainId = useChainId();
	const onExpectedNetwork = chainId === arcTestnet.id;

	if (isConnected) {
		return (
			<>
				<div className="font-semibold text-sky-900 text-xs uppercase tracking-[0.18em]">
					Wallet Environment
				</div>
				<div className="grid gap-2 sm:grid-cols-2">
					<div className="rounded-lg border border-sky-200 bg-white p-2">
						<div className="text-sky-800 text-xs">Target network</div>
						<div className="mt-1 font-semibold text-sky-900 text-sm">
							{arcTestnet.name}
						</div>
						<div
							className={
								onExpectedNetwork
									? "mt-1 text-emerald-700 text-xs"
									: "mt-1 text-amber-700 text-xs"
							}
						>
							{onExpectedNetwork
								? "Connected to Arc Testnet"
								: `Current chain id: ${chainId}`}
						</div>
					</div>

					<div className="rounded-lg border border-sky-200 bg-white p-2">
						<div className="text-sky-800 text-xs">Facilitator URL</div>
						<Link
							className="mt-1 block truncate font-bold font-mono text-sky-900 text-sm underline"
							href={facilitatorUrl}
							rel="noreferrer"
							target="_blank"
						>
							{facilitatorUrl}
						</Link>
					</div>
				</div>

				<Connection address={address} />
			</>
		);
	}

	return (
		<div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
			<div className="space-y-3 rounded-xl border border-sky-200 bg-sky-50 p-3">
				<div className="font-semibold text-sky-900 text-xs uppercase tracking-[0.18em]">
					Wallet Environment
				</div>
				<div className="grid gap-2 sm:grid-cols-2">
					<div className="rounded-lg border border-sky-200 bg-white p-2">
						<div className="text-sky-800 text-xs">Required network</div>
						<div className="mt-1 font-semibold text-sky-900 text-sm">
							{arcTestnet.name}
						</div>
					</div>
					<div className="rounded-lg border border-sky-200 bg-white p-2">
						<div className="text-sky-800 text-xs">Facilitator URL</div>
						<Link
							className="mt-1 block truncate font-bold font-mono text-sky-900 text-sm underline"
							href={facilitatorUrl}
							rel="noreferrer"
							target="_blank"
						>
							{facilitatorUrl}
						</Link>
					</div>
				</div>
			</div>

			<WalletOptions />
		</div>
	);
}
