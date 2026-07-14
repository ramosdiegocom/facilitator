import type { RouterClient } from "@orpc/server";
import { db } from "@ramoz/db";
import {
	insertUserSchema,
	user as userTable,
	wallet as walletTable,
} from "@ramoz/db/schema";
import { env } from "@ramoz/env/finance";
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
import { type PaymentRequired, x402Client, x402HTTPClient } from "@x402/fetch";
import { eq } from "drizzle-orm";
import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod/v4";
import {
	facilitatorClient,
	X402_FACILITATOR_BASE_URL,
} from "@/app/api/facilitator";
import { protectedProcedure } from "@/app/api/routers/procedures";
import {
	x402VerifyRequestBodySchema,
	x402VerifyResponseSchema,
} from "@/app/api/routers/schemas";

// export const appRouter = {
// 	healthCheck: publicProcedure.handler(() => {
// 		return "OK";
// 	}),
// 	privateData: protectedProcedure.handler(({ context }) => {
// 		return {
// 			message: "This is private",
// 			user: context.session?.user,
// 		};
// 	}),
// };

const evmPrivateKey = env.PRIVATE_KEY as Hex;

export const facilitatorRouter = {
	// supportedWithClient: protectedProcedure.handler(async () => {
	// 	const supported = (await facilitatorClient.getSupported()) as unknown;
	// 	return { supported };
	// }),

	supportedWithFetch: protectedProcedure.handler(async () => {
		const response = await fetch(`${X402_FACILITATOR_BASE_URL}/supported`, {
			method: "GET",
			headers: { Accept: "application/json" },
		});

		if (!response.ok) {
			throw new Error(
				`Facilitator fetch failed with status ${response.status}`
			);
		}

		const supported = (await response.json()) as unknown;
		return { supported };
	}),

	verifyWithClient: protectedProcedure
		.input(x402VerifyRequestBodySchema)
		.handler(async ({ input }) => {
			const response = (await facilitatorClient.verify(
				input.paymentPayload,
				input.paymentRequirements
			)) as unknown;

			const parsed = x402VerifyResponseSchema.safeParse(response);

			if (parsed.success === false) {
				throw new Error(
					`Invalid response body: ${JSON.stringify(parsed.error.format())}`
				);
			}
			return parsed.data;
		}),

	verifyWithFetch: protectedProcedure
		.input(x402VerifyRequestBodySchema)
		.handler(async ({ input }) => {
			const response = await fetch(`${X402_FACILITATOR_BASE_URL}/verify`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Accept: "application/json",
					Authorization: `Bearer ${env.FACILITATOR_API_KEY}`,
				},
				body: JSON.stringify({
					x402Version: 2,
					paymentPayload: input.paymentPayload,
					paymentRequirements: input.paymentRequirements,
				}),
			});

			const parsed = x402VerifyResponseSchema.safeParse(response);

			if (parsed.success === false) {
				throw new Error(
					`Invalid request body: ${JSON.stringify(parsed.error.format())}`
				);
			}

			return parsed.data;
		}),
};

type StepResult = {
	step: string;
	ok: boolean;
	detail: unknown;
};

const receiptAttestationRouter = {
	run: protectedProcedure.handler(async () => {
		const url = "https://examples.localhost/weather";

		const steps: StepResult[] = [];
		const evmSigner = privateKeyToAccount(evmPrivateKey);

		const client = new x402Client();
		registerExactEvmScheme(client, { signer: evmSigner });
		const httpClient = new x402HTTPClient(client);

		const initialResponse = await fetch(url, { method: "GET" });
		steps.push({
			step: "Initial request",
			ok: initialResponse.status === 402,
			detail: {
				status: initialResponse.status,
				statusText: initialResponse.statusText,
			},
		});

		if (initialResponse.status !== 402) {
			const bodyText = await initialResponse.text();
			return {
				success: false,
				url,
				steps,
				error:
					"Expected HTTP 402 from resource server. Verify your test endpoint requires x402 payment.",
				initialResponseBody: bodyText,
			};
		}

		const paymentRequiredBody =
			(await initialResponse.json()) as PaymentRequired;
		const getHeader = (name: string) => initialResponse.headers.get(name);
		const paymentRequired = httpClient.getPaymentRequiredResponse(
			getHeader,
			paymentRequiredBody
		);

		const signedOffers = extractOffersFromPaymentRequired(paymentRequired);
		steps.push({
			step: "Extract signed offers",
			ok: signedOffers.length > 0,
			detail: {
				offersFound: signedOffers.length,
			},
		});

		if (signedOffers.length === 0) {
			return {
				success: false,
				url,
				steps,
				error: "No signed offers found in the 402 response.",
			};
		}

		const decodedOffers = decodeSignedOffers(signedOffers);
		const verificationResults: Array<{
			acceptIndex: number;
			signatureType: "JWS" | "EIP-712";
			ok: boolean;
			message?: string;
			signer?: string;
		}> = [];

		let selectedOffer: (typeof decodedOffers)[number] | null = null;

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
					const { signer } = await verifyOfferSignatureEIP712(
						decoded.signedOffer
					);
					verificationResults.push({
						acceptIndex,
						signatureType: "EIP-712",
						ok: true,
						signer,
					});
				}

				selectedOffer = decoded;
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

		steps.push({
			step: "Verify signed offers",
			ok: selectedOffer !== null,
			detail: verificationResults,
		});

		if (!selectedOffer) {
			return {
				success: false,
				url,
				steps,
				error: "No signed offer passed signature verification.",
				offers: decodedOffers,
			};
		}

		const matchingAccept = findAcceptsObjectFromSignedOffer(
			selectedOffer,
			paymentRequired.accepts
		);

		steps.push({
			step: "Find matching accepts entry",
			ok: matchingAccept !== null,
			detail: {
				acceptIndex: selectedOffer.acceptIndex,
			},
		});

		if (!matchingAccept) {
			return {
				success: false,
				url,
				steps,
				error: "No matching accepts[] entry found for selected signed offer.",
				offers: decodedOffers,
			};
		}

		const paymentPayload = await client.createPaymentPayload(paymentRequired);
		const paymentHeaders =
			httpClient.encodePaymentSignatureHeader(paymentPayload);

		const paidResponse = await fetch(url, {
			method: "GET",
			headers: paymentHeaders,
		});

		const paidResponseText = await paidResponse.text();

		steps.push({
			step: "Make payment and retry request",
			ok: paidResponse.ok,
			detail: {
				status: paidResponse.status,
				statusText: paidResponse.statusText,
			},
		});

		const paymentSettleResponse = httpClient.getPaymentSettleResponse((name) =>
			paidResponse.headers.get(name)
		);

		const signedReceipt = extractReceiptFromResponse(paidResponse);

		if (!signedReceipt) {
			return {
				success: paidResponse.ok,
				url,
				steps,
				offers: decodedOffers,
				selectedOffer,
				paidResponse: {
					status: paidResponse.status,
					body: paidResponseText,
				},
				paymentSettleResponse,
				receipt: null,
				message:
					"Payment succeeded but no signed receipt header was returned by the server.",
			};
		}

		const receiptPayload = extractReceiptPayload(signedReceipt);

		let receiptSignatureCheck:
			| {
					type: "JWS" | "EIP-712";
					ok: true;
					signer?: string;
			  }
			| {
					type: "JWS" | "EIP-712";
					ok: false;
					message: string;
			  };

		try {
			if (isJWSSignedReceipt(signedReceipt)) {
				await verifyReceiptSignatureJWS(signedReceipt);
				receiptSignatureCheck = { type: "JWS", ok: true };
			} else {
				const { signer } = await verifyReceiptSignatureEIP712(signedReceipt);
				receiptSignatureCheck = { type: "EIP-712", ok: true, signer };
			}
		} catch (error) {
			receiptSignatureCheck = {
				type: isJWSSignedReceipt(signedReceipt) ? "JWS" : "EIP-712",
				ok: false,
				message: error instanceof Error ? error.message : String(error),
			};
		}

		const receiptMatchesOffer = verifyReceiptMatchesOffer(
			signedReceipt,
			selectedOffer,
			[evmSigner.address]
		);

		steps.push({
			step: "Verify receipt",
			ok: receiptSignatureCheck.ok && receiptMatchesOffer,
			detail: {
				receiptSignatureCheck,
				receiptMatchesOffer,
			},
		});

		return {
			success: true,
			url,
			steps,
			offers: decodedOffers,
			selectedOffer,
			paymentSettleResponse,
			paidResponse: {
				status: paidResponse.status,
				body: paidResponseText,
			},
			receipt: {
				format: signedReceipt.format,
				payload: receiptPayload,
				receiptSignatureCheck,
				receiptMatchesOffer,
			},
			proofs: {
				x402Receipt: true,
				x402Offer: true,
			},
		};
	}),
};

const userRouter = {
	create: protectedProcedure
		.input(
			insertUserSchema.omit({ updatedAt: true, createdAt: true, nanoId: true })
		)
		.handler(async ({ input }) => {
			const [user] = await db.insert(userTable).values(input).returning();
			if (!user) {
				throw new Error("Failed to create user");
			}
			return { user };
		}),

	list: protectedProcedure.handler(
		async () => await db.select().from(userTable).orderBy(userTable.createdAt)
	),

	get: protectedProcedure
		.input(z.object({ id: z.string() }))
		.handler(async ({ input }) => {
			const [user] = await db
				.select()
				.from(userTable)
				.where(eq(userTable.nanoId, input.id));
			if (!user) {
				throw new Error("User not found");
			}
			// Fetch associated wallet if exists
			const [userWallet] = await db
				.select()
				.from(walletTable)
				.where(eq(walletTable.userId, user.id));

			return { user, wallet: userWallet || null };
		}),

	updateEmail: protectedProcedure
		.input(z.object({ email: z.email() }))
		.handler(async ({ input }) => {
			const [firstUser] = await db.select().from(userTable).limit(1);
			if (!firstUser) {
				throw new Error("No user found");
			}
			const [updated] = await db
				.update(userTable)
				.set({ email: input.email })
				.where(eq(userTable.id, firstUser.id))
				.returning();
			if (!updated) {
				throw new Error("Failed to update email");
			}
			return { user: updated };
		}),
};

const walletRouter = {
	// Get current user's wallet
	get: protectedProcedure.handler(async ({ context }) => {
		if (!context.session?.user) {
			throw new Error("No session");
		}
		const [wallet] = await db
			.select()
			.from(walletTable)
			.where(eq(walletTable.userId, BigInt(context.session.user.id)));
		return { wallet: wallet || null };
	}),

	// Get wallet by user ID (admin use case)
	getByUserId: protectedProcedure
		.input(z.object({ userId: z.bigint() }))
		.handler(async ({ input }) => {
			const [wallet] = await db
				.select()
				.from(walletTable)
				.where(eq(walletTable.userId, input.userId));
			return { wallet: wallet || null };
		}),
};

type AppRouterShape = {
	user: typeof userRouter;
	wallet: typeof walletRouter;
	facilitator: typeof facilitatorRouter;
	receiptAttestation: typeof receiptAttestationRouter;
};

export const appRouter: AppRouterShape = {
	user: userRouter,
	wallet: walletRouter,
	facilitator: facilitatorRouter,
	receiptAttestation: receiptAttestationRouter,
};

export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
