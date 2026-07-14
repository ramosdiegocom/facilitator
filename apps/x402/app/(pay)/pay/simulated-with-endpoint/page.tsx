"use client";

import { useState } from "react";
import type { BaseError } from "wagmi";
import {
	useChainId,
	useConnection,
	useSignMessage,
	useSwitchChain,
} from "wagmi";
import { arcTestnet } from "wagmi/chains";
import { ConnectWallet } from "@/app/(pay)/pay/connect-wallet";

type MockPaymentRequirements = {
	scheme: "exact";
	network: `eip155:${number}`;
	asset: `0x${string}`;
	amount: string;
	payTo: `0x${string}`;
	maxTimeoutSeconds: number;
};

type EndpointPaidResponse = {
	status: 200;
	body: {
		ok: true;
		source: "mock-402-simulator";
		data: {
			city: string;
			temperatureC: number;
			condition: string;
		};
	};
	headers: {
		"x-payment-transaction": `0x${string}`;
	};
};

export default function SimulatedWithEndpointPage() {
	const chainId = useChainId();
	const { address, isConnected } = useConnection();
	const switchChain = useSwitchChain();
	const signMessage = useSignMessage();

	const [isRunning, setIsRunning] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [txHash, setTxHash] = useState<string | null>(null);
	const [challenge, setChallenge] = useState<MockPaymentRequirements | null>(
		null
	);
	const [signedPayload, setSignedPayload] = useState<string | null>(null);
	const [finalResponse, setFinalResponse] =
		useState<EndpointPaidResponse | null>(null);

	const runFlow = async () => {
		const isWalletReady = Boolean(isConnected && address);

		if (!isWalletReady) {
			setErrorMessage("Connect your wallet before running the simulation.");
			return;
		}

		setIsRunning(true);
		setErrorMessage(null);
		setTxHash(null);
		setChallenge(null);
		setSignedPayload(null);
		setFinalResponse(null);

		try {
			const challengeHttpResponse = await fetch("/pay-here", {
				method: "GET",
				headers: {
					"x-chain-id": `${chainId}`,
				},
			});

			const PAYMENT_REQUIRED =
				challengeHttpResponse.headers.get("PAYMENT-REQUIRED");

			if (challengeHttpResponse.status !== 402) {
				throw new Error(
					`Expected 402 challenge, got ${challengeHttpResponse.status}.`
				);
			}

			if (!PAYMENT_REQUIRED) {
				throw new Error(
					"Expected PAYMENT-REQUIRED header with challenge, but it was missing."
				);
			}

			const paymentRequirements: MockPaymentRequirements = JSON.parse(
				atob(PAYMENT_REQUIRED)
			);

			setChallenge(paymentRequirements);

			const mockMessage = JSON.stringify({
				x402Version: 2,
				paymentRequirements,
			});

			const signature = (await signMessage.mutateAsync({
				message: mockMessage,
			})) as `0x${string}`;

			const payload = {
				x402Version: 2,
				paymentPayload: {
					x402Version: 2,
					payload: {
						signature,
						authorization: {
							from: "",
							to: "",
							value: "",
							validAfter: "",
							validBefore: "",
							nonce: "",
						},
					},
					accepted: {
						scheme: "exact",
						network: "eip155:8453",
						asset: "",
						amount: "",
						payTo: "",
						maxTimeoutSeconds: 0,
						extra: {},
					},
					resource: {},
					extensions: {},
				},
				paymentRequirements,
			};

			const serializedPayload = JSON.stringify(payload);
			setSignedPayload(JSON.stringify(payload, null, 2));

			const settledHttpResponse = await fetch("/pay-here", {
				method: "GET",
				headers: {
					"PAYMENT-SIGNATURE": serializedPayload,
				},
			});

			if (!settledHttpResponse.ok) {
				throw new Error(
					`Paid request failed with status ${settledHttpResponse.status}.`
				);
			}

			const settledBody =
				(await settledHttpResponse.json()) as EndpointPaidResponse["body"];
			const paidResponse: EndpointPaidResponse = {
				status: 200,
				body: settledBody,
				headers: {
					"x-payment-transaction":
						(settledHttpResponse.headers.get(
							"x-payment-transaction"
						) as `0x${string}`) || "0x0",
				},
			};

			setFinalResponse(paidResponse);
			setTxHash(paidResponse.headers["x-payment-transaction"]);
		} catch (error) {
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
				This page runs the same 3-step debug flow, but it fetches the raw
				endpoint at /pay-here for challenge and settlement.
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

			{txHash && (
				<div className="rounded border border-green-200 bg-green-50 p-3 text-green-900 text-sm">
					<div className="font-medium">Mock Transaction Hash</div>
					<div className="break-all">{txHash}</div>
				</div>
			)}

			{errorMessage && (
				<div className="rounded border border-red-200 bg-red-50 p-3 text-red-800 text-sm">
					{errorMessage}
				</div>
			)}

			{challenge && (
				<div className="rounded border border-gray-200 p-3 text-sm">
					<div className="font-medium">Step 1: Endpoint 402 Challenge</div>
					<pre className="mt-2 overflow-auto rounded bg-gray-50 p-2 text-xs">
						{JSON.stringify(challenge, null, 2)}
					</pre>
				</div>
			)}

			{signedPayload && (
				<div className="rounded border border-gray-200 p-3 text-sm">
					<div className="font-medium">Step 2: Signed Payment Payload</div>
					<pre className="mt-2 overflow-auto rounded bg-gray-50 p-2 text-xs">
						{signedPayload}
					</pre>
				</div>
			)}

			{finalResponse && (
				<div className="rounded border border-gray-200 p-3 text-sm">
					<div className="font-medium">Step 3: Endpoint Settled Response</div>
					<pre className="mt-2 overflow-auto rounded bg-gray-50 p-2 text-xs">
						{JSON.stringify(finalResponse, null, 2)}
					</pre>
				</div>
			)}
		</div>
	);
}
