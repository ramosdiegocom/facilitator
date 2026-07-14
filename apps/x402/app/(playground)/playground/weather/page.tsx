"use client";

import type { SettleResponse } from "@x402/core/types";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { wrapFetchWithPayment, x402Client, x402HTTPClient } from "@x402/fetch";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatUnits } from "viem";
import type { BaseError } from "wagmi";
import {
	useBalance,
	useChainId,
	useConnection,
	useDisconnect,
	useSwitchChain,
	useWalletClient,
} from "wagmi";
import { arcTestnet } from "wagmi/chains";
import { wagmiToClientSigner } from "@/app/(pay)/pay/simple-hash/browserAdapter";
import { WalletOptions } from "@/app/(pay)/pay/wallet-options";
import { ARC_TESTNET_FAUCET_ADDRESS } from "@/lib/constants";

type FlowStep = "idle" | "requesting" | "paid" | "decoded";

const weatherDataCost = "$0.0001";
const SCROLL_EXTRA_OFFSET_PX = 16;
const UNITLESS_NUMBER_REGEX = /^\d+(\.\d+)?$/;

function toPixels(value: string, rootFontSizePx: number) {
	const numeric = Number.parseFloat(value);

	if (Number.isNaN(numeric)) {
		return 0;
	}

	if (value.endsWith("rem")) {
		return numeric * rootFontSizePx;
	}

	if (value.endsWith("px")) {
		return numeric;
	}

	return numeric;
}

function resolveTopNavOffsetPx(target: HTMLDivElement) {
	const styles = window.getComputedStyle(target);
	const rootStyles = window.getComputedStyle(document.documentElement);
	const topNavHeightRaw = styles.getPropertyValue("--top-nav-height").trim();
	const spacingRaw = styles.getPropertyValue("--spacing").trim();
	const rootFontSizePx = toPixels(rootStyles.fontSize, 16) || 16;
	const spacingPx = toPixels(spacingRaw, rootFontSizePx);

	if (UNITLESS_NUMBER_REGEX.test(topNavHeightRaw)) {
		return Number.parseFloat(topNavHeightRaw) * spacingPx;
	}

	return toPixels(topNavHeightRaw, rootFontSizePx);
}

function truncateAddress(value?: `0x${string}`) {
	if (!value) {
		return "Not connected";
	}

	return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export default function PlaygroundWeatherPage() {
	const chainId = useChainId();
	const { address, isConnected } = useConnection();
	const { disconnect } = useDisconnect();
	const switchChain = useSwitchChain();
	const walletClient = useWalletClient();
	const usdcBalance = useBalance({
		address,
		chainId: arcTestnet.id,
		query: {
			enabled: !!address,
		},
	});

	const [isRunning, setIsRunning] = useState(false);
	const [step, setStep] = useState<FlowStep>("idle");
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [weatherPayload, setWeatherPayload] = useState<unknown>(null);
	const [settleResponse, setSettleResponse] = useState<SettleResponse | null>(
		null
	);
	const whatHappenedRef = useRef<HTMLDivElement>(null);

	const settledTxHash =
		settleResponse?.success === true && settleResponse.transaction
			? settleResponse.transaction
			: null;
	const canPay =
		isConnected &&
		chainId === arcTestnet.id &&
		!!address &&
		!!walletClient.data;

	useEffect(() => {
		if (step !== "decoded") {
			return;
		}

		const hasOutcome = weatherPayload == null ? settleResponse != null : true;

		if (hasOutcome) {
			const target = whatHappenedRef.current;

			if (!target) {
				return;
			}

			const topNavOffsetPx = resolveTopNavOffsetPx(target);
			const targetY = target.getBoundingClientRect().top + window.scrollY;

			window.scrollTo({
				behavior: "smooth",
				top: Math.max(targetY - topNavOffsetPx - SCROLL_EXTRA_OFFSET_PX, 0),
			});
		}
	}, [step, weatherPayload, settleResponse]);

	const runFlow = async () => {
		const isWalletReady = isConnected && !!address && !!walletClient.data;

		if (!isWalletReady) {
			setErrorMessage("Connect your wallet before running the weather flow.");
			return;
		}

		const clientX402 = new x402Client();
		const signer = wagmiToClientSigner(walletClient.data);
		registerExactEvmScheme(clientX402, { signer });

		const fetchWithPayment = wrapFetchWithPayment(fetch, clientX402);

		setIsRunning(true);
		setStep("requesting");
		setErrorMessage(null);
		setSettleResponse(null);
		setWeatherPayload(null);

		try {
			const paidResponse = await fetchWithPayment("/weather", {
				method: "GET",
			});

			setStep("paid");

			const weatherJson = (await paidResponse.json()) as unknown;
			const decodedSettleResponse = new x402HTTPClient(
				clientX402
			).getPaymentSettleResponse((headerName) =>
				paidResponse.headers.get(headerName)
			);

			setWeatherPayload(weatherJson);
			setSettleResponse(decodedSettleResponse);
			setStep("decoded");
		} catch (error) {
			console.error(error);
			setErrorMessage(
				(error as BaseError).shortMessage ||
					(error as Error).message ||
					"Failed to complete x402 weather flow."
			);
		} finally {
			setIsRunning(false);
		}
	};

	return (
		<div className="mx-auto w-full max-w-3xl space-y-6 py-4">
			<div className="rounded-[1.75rem] border border-slate-300/70 bg-white/90 p-8 shadow-[0_12px_36px_rgba(15,23,42,0.14)] backdrop-blur">
				<p className="text-center font-semibold text-[11px] text-slate-500 uppercase tracking-[0.22em]">
					x402 Playground
				</p>
				<h1 className="mt-4 text-center font-semibold text-3xl text-slate-900 tracking-tight">
					Payment Required
				</h1>
				<p className="mx-auto mt-4 max-w-2xl text-center text-base text-slate-900/90 leading-relaxed">
					Premium weather: Arc forecast feed.
				</p>
				<p className="mt-4 text-center text-slate-600 text-sm italic">
					Need USDC on Arc Testnet?{" "}
					<Link
						className="font-medium text-blue-700 underline"
						href="https://faucet.arc.net"
						rel="noreferrer"
						target="_blank"
					>
						Get some here.
					</Link>
				</p>

				{isConnected ? (
					<button
						className="mx-auto mt-6 block w-full max-w-xl rounded-xl bg-slate-100 px-4 py-3 font-semibold text-base text-slate-800 transition hover:bg-slate-200"
						onClick={() => disconnect()}
						type="button"
					>
						Disconnect
					</button>
				) : (
					<div className="mx-auto mt-6 max-w-xl space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
						<p className="font-medium text-slate-700 text-sm">
							Connect a wallet to continue.
						</p>
						<WalletOptions />
					</div>
				)}

				<div className="mx-auto mt-6 max-w-xl rounded-2xl bg-slate-100 p-5">
					<div className="grid gap-3 text-base text-slate-800 sm:grid-cols-2">
						<span className="text-slate-700">Wallet:</span>
						<span className="font-semibold">{truncateAddress(address)}</span>

						<span className="text-slate-700">Available balance:</span>
						<span className="font-semibold">
							{usdcBalance.data
								? `${Number(formatUnits(usdcBalance.data.value, usdcBalance.data.decimals)).toFixed(6)} ${usdcBalance.data.symbol}`
								: "-"}
						</span>

						<span className="text-slate-700">Amount:</span>
						<span className="font-semibold">{weatherDataCost} USDC</span>

						<span className="text-slate-700">Network:</span>
						<span className="font-semibold">
							{chainId === arcTestnet.id
								? arcTestnet.name
								: `${arcTestnet.name} required`}
						</span>
					</div>
				</div>

				{isConnected && chainId !== arcTestnet.id && (
					<button
						className="mx-auto mt-5 block rounded-xl border border-slate-300 bg-white px-5 py-2 font-medium text-slate-800 text-sm transition hover:bg-slate-50"
						onClick={() => switchChain.mutate({ chainId: arcTestnet.id })}
						type="button"
					>
						Switch to {arcTestnet.name}
					</button>
				)}

				<button
					className="mx-auto mt-6 block w-full max-w-xl rounded-xl bg-blue-600 px-4 py-3 font-semibold text-lg text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-300"
					disabled={!canPay || isRunning}
					onClick={runFlow}
					type="button"
				>
					{isRunning ? "Processing payment..." : "Pay now"}
				</button>

				<p className="mt-3 text-center text-slate-600 text-xs">
					Flow status: <span className="font-semibold uppercase">{step}</span>
				</p>

				{errorMessage && (
					<div className="mx-auto mt-4 max-w-xl rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-800 text-sm">
						{errorMessage}
					</div>
				)}
			</div>

			{(weatherPayload || settleResponse) && (
				<div
					className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-lg"
					ref={whatHappenedRef}
				>
					<div>
						<h2 className="font-semibold text-slate-900 text-xl">
							What happened
						</h2>
						<p className="mt-1 text-slate-600 text-sm">
							Inspect an invoice-style transaction preview, the weather
							response, and x402 settlement metadata.
						</p>
					</div>

					<div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
						<p className="font-medium text-slate-900 text-sm">
							Payment invoice (example)
						</p>
						<div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
							<div className="rounded-lg border border-slate-200 bg-white p-2">
								<div className="text-slate-500">From</div>
								<div className="mt-1 break-all font-mono text-[11px] text-slate-900">
									{address ?? "Connect wallet to resolve payer"}
								</div>
							</div>
							<div className="rounded-lg border border-slate-200 bg-white p-2">
								<div className="text-slate-500">To (recipient)</div>
								<div className="mt-1 break-all font-mono text-[11px] text-slate-900">
									{ARC_TESTNET_FAUCET_ADDRESS}
								</div>
								<div className="mt-1 text-[11px] text-slate-500">
									ARC testnet faucet (example payee)
								</div>
							</div>
							<div className="rounded-lg border border-slate-200 bg-white p-2">
								<div className="text-slate-500">Amount</div>
								<div className="mt-1 font-semibold text-slate-900">
									{weatherDataCost}
								</div>
							</div>
							<div className="rounded-lg border border-slate-200 bg-white p-2">
								<div className="text-slate-500">Chain</div>
								<div className="mt-1 text-slate-900">
									{arcTestnet.name} ({arcTestnet.id})
								</div>
							</div>
							<div className="rounded-lg border border-slate-200 bg-white p-2 sm:col-span-2">
								<div className="text-slate-500">Data purchased</div>
								<div className="mt-1 text-slate-900">
									GET /weather - current weather report (weather + temperature)
								</div>
							</div>
						</div>
					</div>

					{settledTxHash && (
						<div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
							<p className="font-medium text-emerald-900 text-sm">
								Settlement transaction
							</p>
							<a
								className="mt-1 block break-all font-mono text-[11px] text-emerald-800 underline"
								href={`https://testnet.arcscan.app/tx/${settledTxHash}`}
								rel="noreferrer"
								target="_blank"
							>
								https://testnet.arcscan.app/tx/{settledTxHash}
							</a>
						</div>
					)}

					<div className="space-y-3">
						<div>
							<p className="font-medium text-slate-900 text-sm">
								Weather response
							</p>
							<pre className="mt-2 max-h-56 overflow-auto rounded-xl bg-slate-950 p-3 text-[11px] text-slate-100">
								{JSON.stringify(weatherPayload, null, 2) ?? "null"}
							</pre>
						</div>

						<div>
							<p className="font-medium text-slate-900 text-sm">
								Settle response headers
							</p>
							<pre className="mt-2 max-h-56 overflow-auto rounded-xl bg-slate-950 p-3 text-[11px] text-slate-100">
								{JSON.stringify(settleResponse, null, 2) ?? "null"}
							</pre>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
