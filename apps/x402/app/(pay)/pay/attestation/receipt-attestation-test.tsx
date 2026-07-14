"use client";

import { registerExactEvmScheme } from "@x402/evm/exact/client";
import {
	decodeSignedOffers,
	extractOffersFromPaymentRequired,
	extractReceiptFromResponse,
	extractReceiptPayload,
	findAcceptsObjectFromSignedOffer,
	isJWSSignedOffer,
	isJWSSignedReceipt,
	verifyOfferSignatureEIP712,
	verifyOfferSignatureJWS,
	verifyReceiptMatchesOffer,
	verifyReceiptSignatureEIP712,
	verifyReceiptSignatureJWS,
} from "@x402/extensions/offer-receipt";
import { x402Client, x402HTTPClient } from "@x402/fetch";
import { useState } from "react";
import {
	type BaseError,
	useChainId,
	useConnection,
	useSwitchChain,
	useWalletClient,
} from "wagmi";
import { arcTestnet, baseSepolia } from "wagmi/chains";
import { ConnectWallet } from "@/app/(pay)/pay/connect-wallet";

type StepResult = {
	step: string;
	ok: boolean;
	detail: unknown;
};

type ReceiptVerification = {
	type: "JWS" | "EIP-712";
	ok: boolean;
	signer?: string;
	message?: string;
};

const SUPPORTED_CHAINS = [baseSepolia, arcTestnet] as const;

export function ReceiptAttestationTest() {
	const chainId = useChainId();
	const { address, isConnected } = useConnection();
	const { data: walletClient } = useWalletClient();
	const switchChain = useSwitchChain();

	const [endpointPath, setEndpointPath] = useState("/weather");
	const [isRunning, setIsRunning] = useState(false);
	const [steps, setSteps] = useState<StepResult[]>([]);
	const [paymentRequired, setPaymentRequired] = useState<unknown>(null);
	const [offers, setOffers] = useState<unknown>(null);
	const [selectedOffer, setSelectedOffer] = useState<unknown>(null);
	const [paymentPayload, setPaymentPayload] = useState<unknown>(null);
	const [paymentSettleResponse, setPaymentSettleResponse] =
		useState<unknown>(null);
	const [paidResponse, setPaidResponse] = useState<unknown>(null);
	const [receipt, setReceipt] = useState<unknown>(null);
	const [requestError, setRequestError] = useState<string | null>(null);

	const pushStep = (step: StepResult) => {
		setSteps((prev) => [...prev, step]);
	};

	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Sequential protocol steps are kept explicit for debugging and teaching.
	const runTest = async () => {
		// biome-ignore lint: Explicit guard for wallet prerequisites.
		if (!isConnected || !address || !walletClient) {
			setRequestError("Connect your wallet before running the test.");
			return;
		}

		setIsRunning(true);
		setRequestError(null);
		setSteps([]);
		setPaymentRequired(null);
		setOffers(null);
		setSelectedOffer(null);
		setPaymentPayload(null);
		setPaymentSettleResponse(null);
		setPaidResponse(null);
		setReceipt(null);

		try {
			const url = endpointPath.startsWith("http")
				? endpointPath
				: `${window.location.origin}${endpointPath.startsWith("/") ? "" : "/"}${endpointPath}`;

			const signer = {
				address,
				signTypedData: async ({
					domain,
					message,
					primaryType,
					types,
				}: {
					domain: Record<string, unknown>;
					message: Record<string, unknown>;
					primaryType: string;
					types: Record<string, unknown>;
				}) =>
					(
						walletClient as {
							signTypedData: (args: unknown) => Promise<`0x${string}`>;
						}
					).signTypedData({
						account: address,
						domain: domain as never,
						message: message as never,
						primaryType: primaryType as never,
						types: types as never,
					}),
			};

			const client = new x402Client();
			registerExactEvmScheme(client, { signer });
			const httpClient = new x402HTTPClient(client);

			const initialResponse = await fetch(url, { method: "GET" });
			pushStep({
				step: "Initial request",
				ok: initialResponse.status === 402,
				detail: {
					status: initialResponse.status,
					statusText: initialResponse.statusText,
				},
			});

			if (initialResponse.status !== 402) {
				const bodyText = await initialResponse.text();
				setPaidResponse({ status: initialResponse.status, body: bodyText });
				throw new Error(
					"Expected HTTP 402 response from the protected endpoint."
				);
			}

			const paymentRequiredBody = (await initialResponse.json()) as Record<
				string,
				unknown
			>;
			const parsedPaymentRequired = httpClient.getPaymentRequiredResponse(
				(name) => initialResponse.headers.get(name),
				paymentRequiredBody
			);
			setPaymentRequired(parsedPaymentRequired);
			const challengedResourceUrl =
				typeof parsedPaymentRequired.resource?.url === "string"
					? parsedPaymentRequired.resource.url
					: url;
			const isCrossOriginChallenge = (() => {
				try {
					return (
						new URL(challengedResourceUrl).origin !== window.location.origin
					);
				} catch {
					return false;
				}
			})();

			if (isCrossOriginChallenge) {
				pushStep({
					step: "Resource URL compatibility",
					ok: true,
					detail: {
						message:
							"Challenge resource URL is cross-origin for the browser. Using server relay to preserve exact challenge URL while avoiding CORS.",
						challengeUrl: challengedResourceUrl,
						relayUrl: "/api/x402/pay-relay",
					},
				});
			}

			const signedOffers = extractOffersFromPaymentRequired(
				parsedPaymentRequired
			);
			pushStep({
				step: "Extract signed offers",
				ok: true,
				detail: { offersFound: signedOffers.length },
			});

			const decodedOffers =
				signedOffers.length > 0 ? decodeSignedOffers(signedOffers) : [];
			setOffers(decodedOffers.length > 0 ? decodedOffers : null);

			const verificationResults: Array<{
				acceptIndex: number;
				signatureType: "JWS" | "EIP-712";
				ok: boolean;
				message?: string;
				signer?: string;
			}> = [];

			let verifiedOffer: (typeof decodedOffers)[number] | null = null;

			if (decodedOffers.length > 0) {
				for (const decoded of decodedOffers) {
					const acceptIndex = decoded.acceptIndex ?? -1;

					try {
						if (isJWSSignedOffer(decoded.signedOffer)) {
							await verifyOfferSignatureJWS(decoded.signedOffer);
							verificationResults.push({
								acceptIndex,
								signatureType: "JWS",
								ok: true,
							});
						} else {
							const { signer: offerSigner } = await verifyOfferSignatureEIP712(
								decoded.signedOffer
							);
							verificationResults.push({
								acceptIndex,
								signatureType: "EIP-712",
								ok: true,
								signer: offerSigner,
							});
						}

						verifiedOffer = decoded;
						break;
					} catch (error) {
						verificationResults.push({
							acceptIndex,
							signatureType: isJWSSignedOffer(decoded.signedOffer)
								? "JWS"
								: "EIP-712",
							ok: false,
							message: error instanceof Error ? error.message : String(error),
						});
					}
				}
			}

			pushStep({
				step: "Verify signed offers",
				ok: true,
				detail:
					decodedOffers.length > 0
						? verificationResults
						: {
								message:
									"No signed offer extension present. Continuing with accepts[] challenge.",
							},
			});

			setSelectedOffer(verifiedOffer);

			const matchingAccept = verifiedOffer
				? findAcceptsObjectFromSignedOffer(
						verifiedOffer,
						parsedPaymentRequired.accepts
					)
				: parsedPaymentRequired.accepts[0];

			pushStep({
				step: "Find matching accepts entry",
				ok: matchingAccept !== null,
				detail: verifiedOffer
					? { acceptIndex: verifiedOffer.acceptIndex }
					: { fallback: "accepts[0]" },
			});

			if (!matchingAccept) {
				throw new Error(
					"Could not find matching accepts[] entry for signed offer."
				);
			}

			const createdPaymentPayload = await client.createPaymentPayload(
				parsedPaymentRequired
			);
			setPaymentPayload(createdPaymentPayload);

			const paymentHeaders = httpClient.encodePaymentSignatureHeader(
				createdPaymentPayload
			);

			let paidResponseRequest: Response;
			try {
				if (isCrossOriginChallenge) {
					paidResponseRequest = await fetch("/api/x402/pay-relay", {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
						},
						body: JSON.stringify({
							url: challengedResourceUrl,
							headers: {
								...paymentHeaders,
								"Access-Control-Expose-Headers":
									"PAYMENT-RESPONSE,X-PAYMENT-RESPONSE",
							},
						}),
					});
				} else {
					paidResponseRequest = await fetch(challengedResourceUrl, {
						method: "GET",
						headers: {
							...paymentHeaders,
							"Access-Control-Expose-Headers":
								"PAYMENT-RESPONSE,X-PAYMENT-RESPONSE",
						},
					});
				}
			} catch (error) {
				throw new Error(
					`Failed to fetch paid request URL (${challengedResourceUrl}). This is usually a browser CORS/TLS issue between hosts or a relay/network issue. ${error instanceof Error ? error.message : String(error)}`
				);
			}

			const paidResponseBody = await paidResponseRequest.text();
			setPaidResponse({
				status: paidResponseRequest.status,
				body: paidResponseBody,
			});

			pushStep({
				step: "Make payment and retry request",
				ok: paidResponseRequest.ok,
				detail: {
					requestUrl: challengedResourceUrl,
					transport: isCrossOriginChallenge ? "relay" : "direct",
					challengeUrl: challengedResourceUrl,
					status: paidResponseRequest.status,
					statusText: paidResponseRequest.statusText,
				},
			});

			if (paidResponseRequest.status === 402) {
				let secondChallengeBody: unknown = paidResponseBody;
				try {
					secondChallengeBody = JSON.parse(paidResponseBody);
				} catch {
					secondChallengeBody = paidResponseBody;
				}

				pushStep({
					step: "Payment verification",
					ok: false,
					detail: {
						message:
							"Server returned 402 again after sending PAYMENT-SIGNATURE. Payment was not accepted/verified.",
						secondChallengeBody,
					},
				});

				return;
			}

			try {
				const settleResponse = httpClient.getPaymentSettleResponse((name) =>
					paidResponseRequest.headers.get(name)
				);
				setPaymentSettleResponse(settleResponse);
			} catch {
				setPaymentSettleResponse(null);
			}

			const signedReceipt = extractReceiptFromResponse(paidResponseRequest);

			if (!signedReceipt) {
				pushStep({
					step: "Extract signed receipt",
					ok: false,
					detail: {
						message:
							"Payment request succeeded but no signed receipt header was returned.",
					},
				});
				return;
			}

			pushStep({
				step: "Extract signed receipt",
				ok: true,
				detail: { format: signedReceipt.format },
			});

			const receiptPayload = extractReceiptPayload(signedReceipt);

			let receiptSignatureCheck: ReceiptVerification;

			try {
				if (isJWSSignedReceipt(signedReceipt)) {
					await verifyReceiptSignatureJWS(signedReceipt);
					receiptSignatureCheck = { type: "JWS", ok: true };
				} else {
					const { signer: receiptSigner } =
						await verifyReceiptSignatureEIP712(signedReceipt);
					receiptSignatureCheck = {
						type: "EIP-712",
						ok: true,
						signer: receiptSigner,
					};
				}
			} catch (error) {
				receiptSignatureCheck = {
					type: isJWSSignedReceipt(signedReceipt) ? "JWS" : "EIP-712",
					ok: false,
					message: error instanceof Error ? error.message : String(error),
				};
			}

			const receiptMatchesOffer = verifiedOffer
				? verifyReceiptMatchesOffer(signedReceipt, verifiedOffer, [address])
				: null;

			pushStep({
				step: "Verify receipt",
				ok: verifiedOffer
					? receiptSignatureCheck.ok && receiptMatchesOffer === true
					: receiptSignatureCheck.ok,
				detail: {
					receiptSignatureCheck,
					receiptMatchesOffer,
					note:
						verifiedOffer === null
							? "Offer/receipt matching skipped because no signed offer was provided by server."
							: undefined,
				},
			});

			setReceipt({
				format: signedReceipt.format,
				payload: receiptPayload,
				receiptSignatureCheck,
				receiptMatchesOffer,
			});
		} catch (error) {
			setRequestError(
				(error as BaseError).shortMessage ||
					(error as Error).message ||
					"Failed to run manual attestation test."
			);
		} finally {
			setIsRunning(false);
		}
	};

	return (
		<div className="mx-auto w-full max-w-4xl space-y-4 px-4 py-6">
			<h1 className="font-semibold text-2xl">
				x402 Receipt Attestation Browser E2E (EVM)
			</h1>
			<p className="text-gray-700 text-sm">
				Manual in-browser flow using your connected wallet: request 402, decode
				and verify signed offers, pay with x402 headers, extract signed receipt,
				and verify receipt proofs.
			</p>

			<ConnectWallet address={address} isConnected={isConnected} />

			<div className="flex flex-wrap gap-2">
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

			<div className="grid gap-3 rounded border border-gray-200 p-4 md:grid-cols-2">
				<label className="flex flex-col gap-1">
					<span className="font-medium text-sm">Endpoint Path</span>
					<input
						className="rounded border border-gray-300 px-3 py-2"
						onChange={(event) => setEndpointPath(event.target.value)}
						value={endpointPath}
					/>
				</label>
			</div>

			<button
				className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
				disabled={isRunning || !isConnected}
				onClick={runTest}
				type="button"
			>
				{isRunning ? "Running test..." : "Run Browser E2E Test"}
			</button>

			{requestError && (
				<div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-red-700 text-sm">
					{requestError}
				</div>
			)}

			{steps.length > 0 && (
				<div className="space-y-3 rounded border border-gray-200 p-4">
					<div className="flex flex-wrap items-center gap-2">
						<span className="font-medium text-sm">Result:</span>
						<span
							className={`rounded px-2 py-1 text-xs ${requestError ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"}`}
						>
							{requestError ? "FAILED" : "SUCCESS"}
						</span>
					</div>

					<div className="space-y-2">
						<h2 className="font-medium text-sm">Flow Steps</h2>
						<ul className="space-y-2">
							{steps.map((stepResult) => (
								<li
									className="rounded border border-gray-200 bg-gray-50 p-3"
									key={stepResult.step}
								>
									<div className="flex items-center gap-2">
										<span className="font-medium text-sm">
											{stepResult.step}
										</span>
										<span
											className={`rounded px-2 py-1 text-xs ${
												stepResult.ok
													? "bg-green-100 text-green-800"
													: "bg-red-100 text-red-800"
											}`}
										>
											{stepResult.ok ? "OK" : "FAILED"}
										</span>
									</div>
									<pre className="mt-2 overflow-auto rounded bg-white p-2 text-xs">
										{JSON.stringify(stepResult.detail, null, 2)}
									</pre>
								</li>
							))}
						</ul>
					</div>

					<details>
						<summary className="cursor-pointer font-medium text-sm">
							Raw protocol artifacts
						</summary>
						<pre className="mt-2 overflow-auto rounded bg-gray-950 p-3 text-green-300 text-xs">
							{JSON.stringify(
								{
									paymentRequired,
									offers,
									selectedOffer,
									paymentPayload,
									paymentSettleResponse,
									paidResponse,
									receipt,
								},
								null,
								2
							)}
						</pre>
					</details>
				</div>
			)}
		</div>
	);
}
