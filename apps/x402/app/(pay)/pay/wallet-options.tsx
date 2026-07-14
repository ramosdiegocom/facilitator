"use client";

import React from "react";
import { type Connector, useConnect, useConnectors } from "wagmi";

export function WalletOptions() {
	const connect = useConnect();
	const connectors = useConnectors();

	return (
		<div className="space-y-2">
			<div className="font-medium text-slate-900 text-sm">Connect wallet</div>
			<div className="grid gap-2 sm:grid-cols-2">
				{connectors.map((connector) => (
					<WalletOption
						connector={connector}
						key={connector.uid}
						onClick={() => connect.mutate({ connector })}
					/>
				))}
			</div>
		</div>
	);
}

function WalletOption({
	connector,
	onClick,
}: {
	connector: Connector;
	onClick: () => void;
}) {
	const [ready, setReady] = React.useState(false);

	React.useEffect(() => {
		(async () => {
			const provider = await connector.getProvider();
			setReady(!!provider);
		})();
	}, [connector]);

	return (
		<button
			className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-slate-800 text-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
			disabled={!ready}
			onClick={onClick}
			type="button"
		>
			{connector.name}
		</button>
	);
}
