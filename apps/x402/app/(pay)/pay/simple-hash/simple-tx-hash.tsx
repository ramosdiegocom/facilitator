"use client";

import { type ClientEvmSigner, toClientEvmSigner } from "@x402/evm";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { wrapFetchWithPayment, x402Client, x402HTTPClient } from "@x402/fetch";
import { useState } from "react";
import type { Account, PublicClient, WalletClient } from "viem";
import {
	type BaseError,
	useChainId,
	useConnection,
	usePublicClient,
	useSwitchChain,
	useWalletClient,
} from "wagmi";
import { arcTestnet } from "wagmi/chains";
import { ConnectWallet } from "@/app/(pay)/pay/connect-wallet";

/**
 * Converts a wagmi/viem WalletClient to a ClientEvmSigner for x402Client
 */
function wagmiToClientSigner(
	walletClient: WalletClient,
	publicClient: PublicClient
): ClientEvmSigner {
	if (!walletClient.account) {
		throw new Error("Wallet client must have an account");
	}

	const readContractAdapter = {
		readContract(args: {
			address: `0x${string}`;
			abi: readonly unknown[];
			functionName: string;
			args?: readonly unknown[];
		}): Promise<unknown> {
			return publicClient.readContract(args);
		},
	};

	return toClientEvmSigner(
		{
			address: walletClient.account.address,
			signTypedData: async (message) => {
				const signature = await walletClient.signTypedData({
					account: walletClient.account as Account,
					domain: message.domain,
					types: message.types,
					primaryType: message.primaryType,
					message: message.message,
				});
				return signature;
			},
		},
		readContractAdapter
	);
}

const PROTECTED_PATH = "/weather";

export function SimpleTxHashFlow() {
	const chainId = useChainId();
	const { address, isConnected } = useConnection();
	const switchChain = useSwitchChain();
	const publicClient = usePublicClient();
	const walletClient = useWalletClient();

	const [isRunning, setIsRunning] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [txHash, setTxHash] = useState<string | null>(null);
	const [responseStatus, setResponseStatus] = useState<number | null>(null);
	const [responseBody, setResponseBody] = useState<string | null>(null);

	const runFlow = async () => {
		const isWalletReady =
			isConnected && !!address && !!walletClient.data && !!publicClient;

		if (!isWalletReady) {
			setErrorMessage("Connect your wallet before running the flow.");
			return;
		}

		setIsRunning(true);
		setErrorMessage(null);
		setTxHash(null);
		setResponseStatus(null);
		setResponseBody(null);

		try {
			const clientX402 = new x402Client();
			const signer = wagmiToClientSigner(walletClient.data, publicClient);
			clientX402.register("eip155:*", new ExactEvmScheme(signer));

			const fetchWithPayment = wrapFetchWithPayment(fetch, clientX402);
			const response = await fetchWithPayment(
				`${window.location.origin}${PROTECTED_PATH}`,
				{ method: "GET" }
			);

			setResponseStatus(response.status);
			const json = await response.json();
			console.log("Response body:", json);
			setResponseBody(JSON.stringify(json, null, 2));

			const settleResponse = new x402HTTPClient(
				clientX402
			).getPaymentSettleResponse((name) => {
				const header = response.headers.get(name);
				console.log(`Header ${name}:`, header);
				return header;
			});

			setTxHash(settleResponse.transaction);

			if (!response.ok) {
				throw new Error(`Paid request failed with status ${response.status}.`);
			}
		} catch (error) {
			setErrorMessage(
				(error as BaseError).shortMessage ||
					(error as Error).message ||
					"Failed to complete x402 flow."
			);
		} finally {
			setIsRunning(false);
		}
	};

	return (
		<div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-6">
			<h1 className="font-semibold text-2xl">Simple x402 Tx Hash Flow</h1>
			<p className="text-gray-700 text-sm">
				One button flow: request a protected endpoint, sign payment in wallet,
				automatically retry with x402 headers, and print the settlement
				transaction hash.
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
				{isRunning ? "Running..." : "Pay /weather and get tx hash"}
			</button>

			{txHash && (
				<div className="rounded border border-green-200 bg-green-50 p-3 text-green-900 text-sm">
					<div className="font-medium">Transaction Hash</div>
					<div className="break-all">{txHash}</div>
				</div>
			)}

			{errorMessage && (
				<div className="rounded border border-red-200 bg-red-50 p-3 text-red-800 text-sm">
					{errorMessage}
				</div>
			)}

			{responseStatus !== null && (
				<div className="rounded border border-gray-200 p-3 text-sm">
					<div>
						<span className="font-medium">Response status:</span>{" "}
						{responseStatus}
					</div>
					{responseBody && (
						<pre className="mt-2 overflow-auto rounded bg-gray-50 p-2 text-xs">
							{responseBody}
						</pre>
					)}
				</div>
			)}
		</div>
	);
}
