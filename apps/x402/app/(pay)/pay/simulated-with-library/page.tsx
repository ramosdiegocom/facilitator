"use client";

import type { SettleResponse } from "@x402/core/types";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { wrapFetchWithPayment, x402Client, x402HTTPClient } from "@x402/fetch";
import { useState } from "react";
import type { BaseError } from "wagmi";
import {
	useChainId,
	useConnection,
	useSwitchChain,
	useWalletClient,
} from "wagmi";
import { arcTestnet } from "wagmi/chains";
import { ConnectWallet } from "@/app/(pay)/pay/connect-wallet";
import { wagmiToClientSigner } from "@/app/(pay)/pay/simple-hash/browserAdapter";

export default function SimulatedWithEndpointPage() {
	const chainId = useChainId();
	const { address, isConnected } = useConnection();
	const switchChain = useSwitchChain();
	const walletClient = useWalletClient();

	const [isRunning, setIsRunning] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [settleResponse, setSettleResponse] = useState<SettleResponse | null>(
		null
	);

	const runFlow = async () => {
		const isWalletReady = isConnected && !!address && !!walletClient.data;

		if (!isWalletReady) {
			setErrorMessage("Connect your wallet before running the flow.");
			return;
		}

		const clientX402 = new x402Client();
		const signer = wagmiToClientSigner(walletClient.data);
		registerExactEvmScheme(clientX402, { signer });

		const fetchWithPayment = wrapFetchWithPayment(fetch, clientX402);

		setIsRunning(true);
		setErrorMessage(null);
		setSettleResponse(null);

		try {
			const paidResponse = await fetchWithPayment("/weather", {
				method: "GET",
			});

			// const paymentResponseHeader =
			// 	paidResponse.headers.get("payment-response");

			// if (!paymentResponseHeader) {
			// 	throw new Error("Missing payment-required header from settled call.");
			// }

			// const decoded = decodePaymentResponseHeader(paymentResponseHeader);

			// console.log("Decoded payment response header:", decoded);

			const settleResponse = new x402HTTPClient(
				clientX402
			).getPaymentSettleResponse((headerName) =>
				paidResponse.headers.get(headerName)
			);

			console.log("Settle response:", settleResponse);

			setSettleResponse(settleResponse);
		} catch (error) {
			console.error(error);
			setErrorMessage(
				(error as BaseError).shortMessage ||
					(error as Error).message ||
					"Failed to complete endpoint-backed x402 flow."
			);
		} finally {
			setIsRunning(false);
		}
	};

	return (
		<div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-6">
			<h1 className="font-semibold text-2xl">Simulated With Endpoint</h1>
			<p className="text-gray-700 text-sm">
				This page uses wrapFetchWithPayment to pay /pay-here automatically and
				then reads the settled payment response headers.
			</p>

			<ConnectWallet address={address} isConnected={isConnected} />

			{chainId !== arcTestnet.id && (
				<button
					className="rounded border border-gray-300 px-3 py-2 text-sm"
					onClick={() => switchChain.mutate({ chainId: arcTestnet.id })}
					type="button"
				>
					Switch to {arcTestnet.name}
				</button>
			)}

			<button
				className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
				disabled={!isConnected || isRunning}
				onClick={runFlow}
				type="button"
			>
				{isRunning ? "Running simulation..." : "Run /pay-here x402 flow"}
			</button>

			{errorMessage && (
				<div className="rounded border border-red-200 bg-red-50 p-3 text-red-800 text-sm">
					{errorMessage}
				</div>
			)}

			{settleResponse && (
				<div className="rounded border border-gray-200 p-3 text-sm">
					<div className="font-medium">Endpoint Settled Response</div>
					<pre className="mt-2 overflow-auto rounded bg-gray-50 p-2 text-xs">
						{JSON.stringify(settleResponse, null, 2)}
					</pre>
				</div>
			)}
		</div>
	);
}
