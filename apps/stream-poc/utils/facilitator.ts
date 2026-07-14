/**
 * Facilitator Context and Utilities
 *
 * Core facilitator logic for payment verification and settlement
 * This integrates with the database to store and retrieve verification/settlement records
 */

import crypto from "node:crypto";
import { db } from "@ramoz/db";
import {
	insertPaymentVerificationSchema,
	paymentVerification,
} from "@ramoz/db/schema";
import { x402Facilitator } from "@x402/core/facilitator";
import { ExactEvmScheme } from "@x402/evm/exact/facilitator";
import { UptoEvmScheme } from "@x402/evm/upto/facilitator";
import { arcTestnet, baseSepolia } from "viem/chains";
import type {
	NetworkCAIP2,
	X402SettleRequestBody,
	X402SettleResponse,
	X402VerifyRequestBody,
	X402VerifyResponse,
} from "@/app/api/routers/schemas";
import { generateEvmClient } from "@/utils/evm-client-factory";

const LOG_LEVEL = process.env.FACILITATOR_LOG_LEVEL || "scrubbed";

const baseSepoliaClient = generateEvmClient({ chain: baseSepolia.id });
const arcTestnetClient = generateEvmClient({ chain: arcTestnet.id });

const facilitator = new x402Facilitator();

facilitator.register(
	`eip155:${baseSepolia.id}`,
	new ExactEvmScheme(baseSepoliaClient, { deployERC4337WithEIP6492: true })
);
facilitator.register(
	`eip155:${arcTestnet.id}`,
	new ExactEvmScheme(arcTestnetClient, { deployERC4337WithEIP6492: true })
);
facilitator.register(
	`eip155:${baseSepolia.id}`,
	new UptoEvmScheme(baseSepoliaClient)
);
facilitator.register(
	`eip155:${arcTestnet.id}`,
	new UptoEvmScheme(arcTestnetClient)
);

export const supported = facilitator.getSupported();

type VerifyManualErrorStatus = 400 | 500 | 502 | 503;
type SettleManualErrorStatus = 400 | 402 | 500 | 502 | 503;

type VerifyManualEndpointError = {
	type: "manual_endpoint_error";
	endpoint: "verify";
	status: VerifyManualErrorStatus;
	data: Record<string, unknown>;
};

type SettleManualEndpointError = {
	type: "manual_endpoint_error";
	endpoint: "settle";
	status: SettleManualErrorStatus;
	data: Record<string, unknown>;
};

type ManualEndpointError =
	| VerifyManualEndpointError
	| SettleManualEndpointError;

export function isManualEndpointError(
	error: unknown
): error is ManualEndpointError {
	return (
		typeof error === "object" &&
		error !== null &&
		"type" in error &&
		(error as { type?: unknown }).type === "manual_endpoint_error"
	);
}

export type SettlementResult = {
	error?: string;
	settlementId: string;
	status: "pending" | "processing" | "confirmed" | "failed";
	transactionHash?: string;
};

/**
 * Hash payload for deduplication and integrity verification
 */
function hashPayload(payload: Record<string, unknown>) {
	return crypto
		.createHash("sha256")
		.update(JSON.stringify(payload))
		.digest("hex");
}

type VerificationPayload = X402VerifyRequestBody["paymentPayload"]["payload"];

const getCandidateAmount = (payload: VerificationPayload) => {
	if ("authorization" in payload) {
		return payload.authorization.value;
	}

	return payload.permit2Authorization.permitted.amount;
};

const getPayerAddress = (payload: VerificationPayload) => {
	if ("authorization" in payload) {
		return payload.authorization.from;
	}

	return payload.permit2Authorization.from;
};

const getRequiredAmount = (
	requirements: X402VerifyRequestBody["paymentRequirements"]
) => {
	if ("maxAmountRequired" in requirements) {
		return requirements.maxAmountRequired;
	}

	return requirements.amount;
};

const isVerifyManualErrorStatus = (
	status: number
): status is VerifyManualErrorStatus =>
	status === 400 || status === 500 || status === 502 || status === 503;

const isSettleManualErrorStatus = (
	status: number
): status is SettleManualErrorStatus =>
	status === 400 ||
	status === 402 ||
	status === 500 ||
	status === 502 ||
	status === 503;

const commonServerErrorPayloadByStatus = {
	500: {
		errorType: "internal_server_error",
		errorMessage: "An internal server error occurred. Please try again later.",
	},
	502: {
		errorType: "bad_gateway",
		errorMessage: "Bad gateway. Please try again later.",
	},
	503: {
		errorType: "service_unavailable",
		errorMessage: "Service unavailable. Please try again later.",
	},
} as const;

const getManualErrorConfig = (extra: Record<string, unknown>) => {
	const status = Number(extra.__manualErrorStatus);
	const reason =
		typeof extra.__manualErrorReason === "string"
			? extra.__manualErrorReason
			: null;
	const message =
		typeof extra.__manualErrorMessage === "string"
			? extra.__manualErrorMessage
			: null;
	const payer =
		typeof extra.__manualErrorPayer === "string"
			? extra.__manualErrorPayer
			: null;

	return { status, reason, message, payer };
};

const maybeThrowManualVerifyError = (body: X402VerifyRequestBody) => {
	const extra = body.paymentRequirements.extra;
	if (!extra || typeof extra !== "object") {
		return;
	}

	const { status, reason, message, payer } = getManualErrorConfig(extra);
	if (status === null || !isVerifyManualErrorStatus(status)) {
		return;
	}

	if (status === 400) {
		throw {
			type: "manual_endpoint_error",
			endpoint: "verify",
			status,
			data: {
				isValid: false,
				invalidReason: reason || "invalid_payload",
				invalidMessage: message || "Manual verify bad request error",
				payer: payer || getPayerAddress(body.paymentPayload.payload),
			},
		} satisfies ManualEndpointError;
	}

	if (status === 500 || status === 502 || status === 503) {
		throw {
			type: "manual_endpoint_error",
			endpoint: "verify",
			status,
			data: commonServerErrorPayloadByStatus[status],
		} satisfies ManualEndpointError;
	}
};

const maybeThrowManualSettleError = (body: X402SettleRequestBody) => {
	const extra = body.paymentRequirements.extra;
	if (!extra || typeof extra !== "object") {
		return;
	}

	const { status, reason, message, payer } = getManualErrorConfig(extra);
	if (status === null || !isSettleManualErrorStatus(status)) {
		return;
	}

	if (status === 400) {
		throw {
			type: "manual_endpoint_error",
			endpoint: "settle",
			status,
			data: {
				success: false,
				errorReason: reason || "invalid_payload",
				errorMessage: message || "Manual settle bad request error",
				payer: payer || getPayerAddress(body.paymentPayload.payload),
			},
		} satisfies ManualEndpointError;
	}

	if (status === 402) {
		throw {
			type: "manual_endpoint_error",
			endpoint: "settle",
			status,
			data: {
				errorType: "payment_method_required",
				errorMessage:
					"A valid payment method is required to complete this operation. Please add a payment method to your account",
			},
		} satisfies ManualEndpointError;
	}

	if (status === 500 || status === 502 || status === 503) {
		throw {
			type: "manual_endpoint_error",
			endpoint: "settle",
			status,
			data: commonServerErrorPayloadByStatus[status],
		} satisfies ManualEndpointError;
	}
};

/**
 * Verify a payment payload
 */
export async function verifyPayment(
	body: X402VerifyRequestBody
): Promise<X402VerifyResponse> {
	// Temporary scaffold: force specific verify error responses by passing
	// paymentRequirements.extra.__manualErrorStatus (400|500|502|503).
	maybeThrowManualVerifyError(body);

	const payloadHash = hashPayload(body.paymentPayload);
	const candidateAmount = getCandidateAmount(body.paymentPayload.payload);
	const requiredAmount = getRequiredAmount(body.paymentRequirements);
	const payer = getPayerAddress(body.paymentPayload.payload);

	// Hooks will automatically:
	// - Track verified payment (onAfterVerify)
	// - Extract and catalog discovery info (onAfterVerify)
	const response = await facilitator.verify(
		body.paymentPayload,
		body.paymentRequirements
	);

	await db.insert(paymentVerification).values(
		insertPaymentVerificationSchema.parse({
			payloadHash,
			x402Version: body.x402Version,
			network: body.paymentRequirements.network,
			requiredAmount,
			candidateAmount,
			payer,
			payTo: body.paymentRequirements.payTo,
			isValid: response.isValid,
			reason: null,
			logLevel: LOG_LEVEL,
			payload: JSON.stringify(body),
			// Set expiration for deduplication window (e.g. 30 days)
			expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
		} satisfies typeof insertPaymentVerificationSchema._zod.input)
	);

	return response;
}

/**
 * Settle a payment by submitting a transaction to the blockchain
 */
export async function settlePayment(
	body: X402SettleRequestBody
): Promise<X402SettleResponse> {
	// Temporary scaffold: force specific settle error responses by passing
	// paymentRequirements.extra.__manualErrorStatus (400|402|500|502|503).
	maybeThrowManualSettleError(body);

	const response = await facilitator.settle(
		body.paymentPayload,
		body.paymentRequirements
	);

	return {
		...response,
		network: response.network as NetworkCAIP2,
	};
}
