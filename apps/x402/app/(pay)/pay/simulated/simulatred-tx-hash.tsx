"use client";

import { useMemo, useState } from "react";
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

type MockChallengeResponse = {
	status: 402;
	body: {
		error: "x402_payment_required";
		message: string;
		paymentRequirements: MockPaymentRequirements;
	};
	headers: {
		"x-mock-flow": "challenge";
		"x-mock-step": "1";
	};
};

type MockPaidResponse = {
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
		"x-mock-flow": "settled";
		"x-mock-step": "3";
		"x-payment-transaction": `0x${string}`;
	};
};

const MOCK_ASSET = "0x3600000000000000000000000000000000000000";
const MOCK_PAY_TO = "0xD844ba11F64d23a7481E24474D2f184e350B9B3d";

function randomHex(bytes: number): `0x${string}` {
	const values = new Uint8Array(bytes);
	crypto.getRandomValues(values);
	return `0x${Array.from(values, (value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function buildMockChallenge(chainId: number): MockChallengeResponse {
	return {
		status: 402,
		body: {
			error: "x402_payment_required",
			message: "Payment required for GET /weather",
			paymentRequirements: {
				scheme: "exact",
				network: `eip155:${chainId}`,
				asset: MOCK_ASSET,
				amount: "1000000",
				payTo: MOCK_PAY_TO,
				maxTimeoutSeconds: 60,
			},
		},
		headers: {
			"x-mock-flow": "challenge",
			"x-mock-step": "1",
		},
	};
}

function buildMockPaidResponse(signature: `0x${string}`): MockPaidResponse {
	const signatureTail = signature.slice(-16).toLowerCase();
	const txHash = `0x${signatureTail.padStart(64, "0")}` as `0x${string}`;

	return {
		status: 200,
		body: {
			ok: true,
			source: "mock-402-simulator",
			data: {
				city: "San Francisco",
				temperatureC: 17,
				condition: "Foggy",
			},
		},
		headers: {
			"x-mock-flow": "settled",
			"x-mock-step": "3",
			"x-payment-transaction": txHash,
		},
	};
}

export function SimulatedTxHashFlow() {
	const chainId = useChainId();
	const { address, isConnected } = useConnection();
	const switchChain = useSwitchChain();
	const signMessage = useSignMessage();

	const [isRunning, setIsRunning] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [txHash, setTxHash] = useState<string | null>(null);
	const [challenge, setChallenge] = useState<MockChallengeResponse | null>(
		null
	);
	const [signedPayload, setSignedPayload] = useState<string | null>(null);
	const [finalResponse, setFinalResponse] = useState<MockPaidResponse | null>(
		null
	);

	const currentNetwork = useMemo(() => `eip155:${chainId}`, [chainId]);

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
			const challengeResponse = buildMockChallenge(chainId);
			setChallenge(challengeResponse);

			const mockMessage = JSON.stringify({
				x402Version: 2,
				step: "sign-payment-authorization",
				network: currentNetwork,
				request: "GET /weather",
				paymentRequirements: challengeResponse.body.paymentRequirements,
			});

			const signature = (await signMessage.mutateAsync({
				message: mockMessage,
			})) as `0x${string}`;

			const payload = {
				x402Version: 2,
				accepted: challengeResponse.body.paymentRequirements,
				payload: {
					authorization: {
						from: address,
						to: challengeResponse.body.paymentRequirements.payTo,
						value: challengeResponse.body.paymentRequirements.amount,
						nonce: randomHex(32),
					},
					signature,
				},
			};
			setSignedPayload(JSON.stringify(payload, null, 2));

			const paidResponse = buildMockPaidResponse(signature);
			setFinalResponse(paidResponse);
			setTxHash(paidResponse.headers["x-payment-transaction"]);
		} catch (error) {
			setErrorMessage(
				(error as BaseError).shortMessage ||
					(error as Error).message ||
					"Failed to complete simulated x402 flow."
			);
		} finally {
			setIsRunning(false);
		}
	};

	return (
		<div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-6">
			<h1 className="font-semibold text-2xl">simulated 402 Tx Hash Flow</h1>
			<p className="text-gray-700 text-sm">
				This page does not call a protected endpoint. It uses local mock 402
				challenge and settlement data so each payment step can be debugged in
				isolation.
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
				{isRunning
					? "Running simulation..."
					: "Run simulated /weather x402 flow"}
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
					<div className="font-medium">Step 1: Mock 402 Challenge</div>
					<pre className="mt-2 overflow-auto rounded bg-gray-50 p-2 text-xs">
						{JSON.stringify(challenge, null, 2)}
					</pre>
				</div>
			)}

			{signedPayload && (
				<div className="rounded border border-gray-200 p-3 text-sm">
					<div className="font-medium">Step 2: Mock Signed Payment Payload</div>
					<pre className="mt-2 overflow-auto rounded bg-gray-50 p-2 text-xs">
						{signedPayload}
					</pre>
				</div>
			)}

			{finalResponse && (
				<div className="rounded border border-gray-200 p-3 text-sm">
					<div className="font-medium">Step 3: Mock Settled Response</div>
					<pre className="mt-2 overflow-auto rounded bg-gray-50 p-2 text-xs">
						{JSON.stringify(finalResponse, null, 2)}
					</pre>
				</div>
			)}
		</div>
	);
}
