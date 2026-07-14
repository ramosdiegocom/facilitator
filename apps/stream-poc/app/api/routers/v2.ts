import { ORPCError } from "@orpc/server";
import {
	apiKeyProcedure,
	// createPublicRateLimitMiddleware,
	publicO,
} from "@/app/api/routers/procedures";
import {
	type X402SettleResponse,
	x402SettleRequestBodySchema,
	x402SettleResponseByStatusSchema,
	x402SupportedResponseByStatusSchema,
	x402SupportedResponseSchema,
	x402VerifyRequestBodySchema,
	x402VerifyResponseByStatusSchema,
} from "@/app/api/routers/schemas";
import {
	supported as facilitatorSupported,
	isManualEndpointError,
	settlePayment,
	verifyPayment,
} from "@/utils/facilitator";

const statusToORPCCode = {
	200: "OK",
	400: "BAD_REQUEST",
	402: "PAYMENT_REQUIRED",
	500: "INTERNAL_SERVER_ERROR",
	502: "BAD_GATEWAY",
	503: "SERVICE_UNAVAILABLE",
} as const;

/**
 * Public Router - Payment Verification and Settlement
 *
 * Endpoints:
 * - GET /v2/supported - Get supported payment schemes and networks
 * - POST /v2/verify - Verify payment signature
 * - POST /v2/settle - Submit settlement to blockchain
 */

/**
 * Get supported payment schemes and networks
 */
const supported = publicO
	// .use(
	// 	createPublicRateLimitMiddleware({
	// 		keyPrefix: "public:supported",
	// 		maxRequests: 60,
	// 		windowSeconds: 60,
	// 		blockSeconds: 60,
	// 		tooManyRequestsMessage: "Too many requests for this endpoint",
	// 		serviceUnavailableMessage: "Service unavailable. Please try again later.",
	// 	})
	// )
	.route({ method: "GET", path: "/supported", summary: "Get supported" })
	.output(x402SupportedResponseByStatusSchema[200])
	.errors({
		TOO_MANY_REQUESTS: {
			status: 429,
			data: x402SupportedResponseByStatusSchema[429],
		},
		INTERNAL_SERVER_ERROR: {
			status: 500,
			data: x402SupportedResponseByStatusSchema[500],
		},
		BAD_GATEWAY: {
			status: 502,
			data: x402SupportedResponseByStatusSchema[502],
		},
		SERVICE_UNAVAILABLE: {
			status: 503,
			data: x402SupportedResponseByStatusSchema[503],
		},
	})
	.handler(() => {
		try {
			return x402SupportedResponseSchema.parse(facilitatorSupported);
		} catch {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				status: 500,
				data: x402SupportedResponseByStatusSchema[500].parse({
					errorType: "internal_server_error",
					errorMessage:
						"An internal server error occurred. Please try again later.",
				}),
			});
		}
	});

/**
 * Verify a payment signature
 */
const verify = apiKeyProcedure
	.route({ method: "POST", path: "/verify", summary: "Verify payment" })
	.output(x402VerifyResponseByStatusSchema[200])
	.errors({
		BAD_REQUEST: {
			status: 400,
			data: x402VerifyResponseByStatusSchema[400],
		},
		INTERNAL_SERVER_ERROR: {
			status: 500,
			data: x402VerifyResponseByStatusSchema[500],
		},
		BAD_GATEWAY: {
			status: 502,
			data: x402VerifyResponseByStatusSchema[502],
		},
		SERVICE_UNAVAILABLE: {
			status: 503,
			data: x402VerifyResponseByStatusSchema[503],
		},
	})
	.input(x402VerifyRequestBodySchema)
	.handler(async ({ input }) => {
		try {
			return await verifyPayment(input);
		} catch (error) {
			if (isManualEndpointError(error) && error.endpoint === "verify") {
				throw new ORPCError(statusToORPCCode[error.status], {
					status: error.status,
					data: x402VerifyResponseByStatusSchema[error.status].parse(
						error.data
					),
				});
			}

			throw error;
		}
	});

/**
 * Submit a settlement to blockchain
 */
const settle = apiKeyProcedure
	.route({ method: "POST", path: "/settle", summary: "Settle payment" })
	.output(x402SettleResponseByStatusSchema[200])
	.errors({
		BAD_REQUEST: {
			status: 400,
			data: x402SettleResponseByStatusSchema[400],
		},
		PAYMENT_REQUIRED: {
			status: 402,
			data: x402SettleResponseByStatusSchema[402],
		},
		INTERNAL_SERVER_ERROR: {
			status: 500,
			data: x402SettleResponseByStatusSchema[500],
		},
		BAD_GATEWAY: {
			status: 502,
			data: x402SettleResponseByStatusSchema[502],
		},
		SERVICE_UNAVAILABLE: {
			status: 503,
			data: x402SettleResponseByStatusSchema[503],
		},
	})
	.input(x402SettleRequestBodySchema)
	.handler(async ({ input }) => {
		let response: X402SettleResponse;
		try {
			response = await settlePayment(input);
		} catch (error) {
			if (isManualEndpointError(error) && error.endpoint === "settle") {
				throw new ORPCError(statusToORPCCode[error.status], {
					status: error.status,
					data: x402SettleResponseByStatusSchema[error.status].parse(
						error.data
					),
				});
			}

			throw error;
		}

		if (response.success === false) {
			throw new ORPCError("PAYMENT_REQUIRED", {
				status: 402,
				message:
					"A valid payment method is required to complete this operation. Please add a payment method to your account",
				data: x402SettleResponseByStatusSchema[402].parse({
					errorType: "payment_method_required",
					errorMessage:
						"A valid payment method is required to complete this operation. Please add a payment method to your account",
				}),
			});
		}

		return response;
	});

// /**
//  * Get verification status
//  */
// const getVerificationStatus = apiKeyProcedure
// 	.input(z.object({ verificationId: z.string() }))
// 	.handler(async ({ input }) =>
// 		getFacilitatorVerificationStatus(input.verificationId)
// 	);

// /**
//  * Get settlement status
//  */
// const getSettlementStatus = apiKeyProcedure
// 	.input(z.object({ settlementId: z.string() }))
// 	.handler(async ({ input }) =>
// 		getFacilitatorSettlementStatus(input.settlementId)
// 	);

/**
 * Export public router
 */
export const publicRouter = {
	supported,
	verify,
	settle,
	// getVerificationStatus,
	// getSettlementStatus,
};

export type PublicRouter = typeof publicRouter;
