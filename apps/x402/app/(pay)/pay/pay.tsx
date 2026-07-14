"use client";

import { useEffect, useState } from "react";
import { type Chain, type Hex, isAddress } from "viem";
import {
	type BaseError,
	useChainId,
	useConnection,
	useSignMessage,
	useSwitchChain,
} from "wagmi";
import { arcTestnet, baseSepolia } from "wagmi/chains";
import { ConnectWallet } from "@/app/(pay)/pay/connect-wallet";
import type { X402VerifyRequestBody } from "@/app/api/routers/schemas";
import { orpc } from "@/utils/orpc";

const ARC_TESTNET_USDC_CONTRACT = "0x3600000000000000000000000000000000000000";
const ARC_TESTNET_FAUCET_ADDRESS = "0xD844ba11F64d23a7481E24474D2f184e350B9B3d";
const TEST_SELLER = "0xE0E3977473C8e04105B1Ff5cBCcDf9A1B49da4Ce";
const TEST_CLIENT = "0xb7a8f6311E438b31d867e669BeBF5646DCC59DDb";

const SUPPORTED_CHAINS: Chain[] = [baseSepolia, arcTestnet];

function randomHex(bytes: number): Hex {
	const values = new Uint8Array(bytes);
	crypto.getRandomValues(values);
	return `0x${Array.from(values, (value) => value.toString(16).padStart(2, "0")).join("")}`;
}

export default function Pay() {
	const chainId = useChainId();
	const { address, isConnected } = useConnection();
	const switchChain = useSwitchChain();
	const signMessage = useSignMessage();

	const [network, setNetwork] = useState<`${string}:${string}`>(
		`eip155:${baseSepolia.id}`
	);
	const [asset, setAsset] = useState(ARC_TESTNET_USDC_CONTRACT);
	const [payTo, setPayTo] = useState(ARC_TESTNET_FAUCET_ADDRESS);
	const [from, setFrom] = useState(TEST_CLIENT);
	const [to, setTo] = useState(TEST_SELLER);
	const [amount, setAmount] = useState("1000000");
	const [isVerifying, setIsVerifying] = useState(false);
	const [signature, setSignature] = useState<Hex | null>(null);
	const [verificationResult, setVerificationResult] = useState<string | null>(
		null
	);
	const [verificationError, setVerificationError] = useState<string | null>(
		null
	);
	const [verificationMethod, setVerificationMethod] = useState<
		"direct" | "facilitator"
	>("direct");

	useEffect(() => {
		setNetwork(`eip155:${chainId}`);
	}, [chainId]);

	const handleVerify = async (method: "direct" | "facilitator") => {
		if (!isConnected) {
			setVerificationResult(null);
			setVerificationError("Connect your wallet before verifying.");
			return;
		}

		const walletAddress = address ?? from;

		if (!isAddress(asset)) {
			setVerificationResult(null);
			setVerificationError("Asset must be a valid EVM address.");
			return;
		}

		if (!isAddress(payTo)) {
			setVerificationResult(null);
			setVerificationError("Pay To must be a valid EVM address.");
			return;
		}

		if (!isAddress(to)) {
			setVerificationResult(null);
			setVerificationError("To must be a valid EVM address.");
			return;
		}

		const now = Math.floor(Date.now() / 1000);
		const paymentRequirements: X402VerifyRequestBody["paymentRequirements"] = {
			scheme: "exact",
			network:
				network as X402VerifyRequestBody["paymentRequirements"]["network"],
			asset,
			amount,
			payTo,
			maxTimeoutSeconds: 60,
			extra: {},
		};

		const nextSignature = await signMessage.mutateAsync({
			message: JSON.stringify({
				x402Version: 2,
				paymentRequirements,
				authorization: {
					from: walletAddress,
					to,
					value: (BigInt(amount) + 1n).toString(),
					validAfter: String(now - 30),
					validBefore: String(now + 300),
				},
			}),
		});

		setSignature(nextSignature as Hex);

		const paymentPayload: X402VerifyRequestBody["paymentPayload"] = {
			x402Version: 2,
			payload: {
				signature: nextSignature,
				authorization: {
					from: walletAddress,
					to,
					value: (BigInt(amount) + 1n).toString(),
					validAfter: String(now - 30),
					validBefore: String(now + 300),
					nonce: randomHex(32),
				},
			},
			accepted: paymentRequirements,
			extensions: {},
		};

		const verifyRequest: X402VerifyRequestBody = {
			x402Version: 2,
			paymentPayload,
			paymentRequirements,
		};

		setIsVerifying(true);
		setVerificationMethod(method);
		setVerificationError(null);
		setVerificationResult(null);

		try {
			if (method === "facilitator") {
				const response = await orpc.facilitator.verifyWithClient(verifyRequest);
				setVerificationResult(JSON.stringify(response, null, 2));
			} else {
				const response = await orpc.facilitator.verifyWithFetch(verifyRequest);
				setVerificationResult(JSON.stringify(response, null, 2));
			}
		} catch (error) {
			const message =
				(error as BaseError).shortMessage ||
				(error as Error).message ||
				"Verification failed.";
			setVerificationError(message);
		} finally {
			setIsVerifying(false);
		}
	};

	return (
		<>
			<ConnectWallet address={address} isConnected={isConnected} />
			<div className="mx-auto mt-4 flex w-full max-w-xl flex-wrap gap-2 px-4">
				{SUPPORTED_CHAINS.map((chain) => (
					<button
						className="rounded border border-gray-300 px-3 py-2 text-sm"
						disabled={chain.id === chainId}
						key={chain.id}
						onClick={() => switchChain.mutate({ chainId: chain.id })}
						type="button"
					>
						Use {chain.name}
					</button>
				))}
			</div>
			<form
				className="mx-auto flex w-full max-w-xl flex-col gap-3 p-4"
				onSubmit={async (event) => {
					event.preventDefault();
					await handleVerify("direct");
				}}
			>
				<label className="flex flex-col gap-1">
					<span>Network</span>
					<input
						className="rounded border border-gray-300 px-3 py-2"
						onChange={(event) =>
							setNetwork(event.target.value as `${string}:${string}`)
						}
						value={network}
					/>
				</label>

				<label className="flex flex-col gap-1">
					<span>Asset</span>
					<input
						className="rounded border border-gray-300 px-3 py-2"
						onChange={(event) => setAsset(event.target.value)}
						value={asset}
					/>
				</label>

				<label className="flex flex-col gap-1">
					<span>Pay To</span>
					<input
						className="rounded border border-gray-300 px-3 py-2"
						onChange={(event) => setPayTo(event.target.value)}
						value={payTo}
					/>
				</label>

				<label className="flex flex-col gap-1">
					<span>From</span>
					<input
						className="rounded border border-gray-300 px-3 py-2"
						onChange={(event) => setFrom(event.target.value)}
						value={address ?? from}
					/>
				</label>

				<label className="flex flex-col gap-1">
					<span>To</span>
					<input
						className="rounded border border-gray-300 px-3 py-2"
						onChange={(event) => setTo(event.target.value)}
						value={to}
					/>
				</label>

				<label className="flex flex-col gap-1">
					<span>Amount</span>
					<input
						className="rounded border border-gray-300 px-3 py-2"
						onChange={(event) => setAmount(event.target.value)}
						value={amount}
					/>
				</label>

				<div className="flex flex-wrap gap-2">
					<button
						className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
						disabled={!isConnected || isVerifying}
						onClick={async () => {
							await handleVerify("direct");
						}}
						type="button"
					>
						{isVerifying && verificationMethod === "direct"
							? "Verifying Direct..."
							: "Verify (Direct Fetch)"}
					</button>
					<button
						className="rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
						disabled={!isConnected || isVerifying}
						onClick={async () => {
							await handleVerify("facilitator");
						}}
						type="button"
					>
						{isVerifying && verificationMethod === "facilitator"
							? "Verifying Client..."
							: "Verify (Facilitator Client)"}
					</button>
				</div>

				{signature && (
					<div className="break-all text-gray-600 text-xs">
						Wallet Signature: {signature}
					</div>
				)}

				{verificationError && (
					<div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-red-700 text-sm">
						{verificationError}
					</div>
				)}

				{verificationResult && (
					<pre className="overflow-auto rounded border border-green-200 bg-green-50 p-3 text-green-900 text-xs">
						{verificationResult}
					</pre>
				)}
			</form>
		</>
	);
}
