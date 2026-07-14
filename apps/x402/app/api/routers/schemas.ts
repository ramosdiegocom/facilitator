import z from "zod/v4";
import {
	supportedChainsCAIP2,
	supportedNetworks,
} from "@/app/api/routers/chains";

const evmChecksumAddressRegex = /^0x[0-9a-fA-F]{40}$/;
const evmTransactionHashRegex = /^0x[0-9a-fA-F]{64}$/;
const eip712HexRegex = /^0x[0-9a-fA-F]{130,}$/;
const base58SolanaAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const base58SolanaTransactionHash = /^[1-9A-HJ-NP-Za-km-z]{87,88}$/;
const hashedNonceRegex = /^0x[0-9a-fA-F]{64}$/;
const numericNonceRegex = /^[0-9]+$/;
const unixTimestampRegex = /^[0-9]+$/;

const evmChecksumAddressSchema = z
	.string()
	.regex(evmChecksumAddressRegex, "Invalid EVM checksum address");
const evmTransactionHashSchema = z
	.string()
	.regex(evmTransactionHashRegex, "Invalid EVM transaction hash");
const eip712HexSchema = z
	.string()
	.regex(eip712HexRegex, "Invalid EIP-712 hex string");
const base58SolanaAddressSchema = z
	.string()
	.regex(base58SolanaAddress, "Invalid Base58 Solana address");
const base58SolanaTransactionHashSchema = z
	.string()
	.regex(base58SolanaTransactionHash, "Invalid Base58 Solana transaction hash");

const hashedNonceSchema = z
	.string()
	.regex(
		hashedNonceRegex,
		"Invalid nonce format, expected 32-byte hex string with 0x prefix"
	);

const numericNonceSchema = z
	.string()
	.regex(numericNonceRegex, "Invalid nonce format, expected numeric string");

const unixTimestampSchema = z
	.string()
	.regex(
		unixTimestampRegex,
		"Invalid timestamp format, expected unix timestamp"
	);

const schemeSchema = z
	.enum(["exact", "upto"])
	.describe(
		"Payment scheme, either 'exact' for fixed payments or 'upto' for variable payments up to a maximum amount"
	);

const extensionsSchema = z.looseRecord(z.string(), z.unknown());
const extraSchema = z.looseRecord(z.string(), z.unknown());

const networkCAIP2Schema = z.enum(supportedChainsCAIP2);
export type NetworkCAIP2 = z.infer<typeof networkCAIP2Schema>;

const acceptedSchema = z.object({
	scheme: schemeSchema,
	network: networkCAIP2Schema,
	asset: evmChecksumAddressSchema.or(base58SolanaAddressSchema),
	amount: z.string().min(1),
	payTo: evmChecksumAddressSchema.or(base58SolanaAddressSchema),
	maxTimeoutSeconds: z.int().nonnegative(),
	extra: z.looseRecord(z.string(), z.unknown()),
});

const resourceSchema = z
	.object({
		url: z.url(),
		description: z.string().max(500),
		mimeType: z.string(),
	})
	.optional();

const authorizationSchema = z.object({
	from: evmChecksumAddressSchema,
	to: evmChecksumAddressSchema,
	value: z.string().min(1),
	validAfter: unixTimestampSchema.refine(
		(value) => BigInt(value) <= BigInt(Math.floor(Date.now() / 1000)),
		"Payment not yet valid"
	),
	validBefore: unixTimestampSchema.refine(
		(value) => BigInt(value) >= BigInt(Math.floor(Date.now() / 1000)),
		"Payment has expired"
	),
	nonce: hashedNonceSchema,
});

const permit2AuthorizationSchema = z.object({
	from: evmChecksumAddressSchema,
	permitted: z.object({
		token: evmChecksumAddressSchema,
		amount: z.string().min(1),
	}),
	spender: evmChecksumAddressSchema,
	nonce: numericNonceSchema,
	deadline: z.string().min(1),
	witness: z.object({
		to: evmChecksumAddressSchema,
		validAfter: z.string().min(1),
		extra: z
			.string()
			.regex(/^0x[0-9a-fA-F]*$/)
			.optional(),
	}),
});

const x402VersionSchema = z.literal([1, 2]);

const payloadSchema = z.object({
	signature: eip712HexSchema,
});

const x402ExactEvmPayload = payloadSchema.extend({
	authorization: authorizationSchema,
});

const x402ExactEvmPermit2Payload = payloadSchema.extend({
	permit2Authorization: permit2AuthorizationSchema,
});

const paymentPayloadOption1Schema = z.object({
	x402Version: x402VersionSchema,
	payload: x402ExactEvmPayload.or(x402ExactEvmPermit2Payload),
	accepted: acceptedSchema,
	resource: resourceSchema.optional(),
	extensions: extensionsSchema.optional(),
});

const networkSchema = z.enum(supportedNetworks);

const paymentPayloadOption2Schema = z.object({
	x402Version: x402VersionSchema,
	scheme: z.enum(["exact"]),
	network: networkSchema,
	payload: x402ExactEvmPayload.or(x402ExactEvmPermit2Payload),
	accepted: acceptedSchema,
	resource: resourceSchema.optional(),
	extensions: extensionsSchema.optional(),
});

const paymentRequirementsOption1Schema = z.object({
	scheme: schemeSchema,
	network: networkCAIP2Schema,
	asset: evmChecksumAddressSchema.or(base58SolanaAddressSchema),
	amount: z.string().min(1),
	payTo: evmChecksumAddressSchema.or(base58SolanaAddressSchema),
	maxTimeoutSeconds: z.int().nonnegative(),
	extra: extraSchema,
});

const paymentRequirementsOption2Schema = z.object({
	scheme: z.enum(["exact"]),
	network: networkCAIP2Schema,
	maxAmountRequired: z.string().min(1),
	resource: z.url(),
	description: z.string().max(500),
	amount: z.string().min(1),
	mimeType: z.string().min(1),
	payTo: evmChecksumAddressSchema.or(base58SolanaAddressSchema),
	maxTimeoutSeconds: z.int().nonnegative(),
	asset: evmChecksumAddressSchema.or(base58SolanaAddressSchema),
	outputSchema: z.looseObject({}).optional(),
	extra: extraSchema,
});

const verifyOption1Schema = z.object({
	x402Version: x402VersionSchema,
	paymentPayload: paymentPayloadOption1Schema,
	paymentRequirements: paymentRequirementsOption1Schema,
});

const verifyOption2Schema = z.object({
	x402Version: x402VersionSchema,
	paymentPayload: paymentPayloadOption2Schema,
	paymentRequirements: paymentRequirementsOption2Schema,
});

// type AuthorizationAmountPayload = {
// 	authorization: z.core.output<typeof authorizationSchema>;
// };

// type Permit2AmountPayload = {
// 	permit2Authorization: z.core.output<typeof permit2AuthorizationSchema>;
// };

// type PaymentPayloadForAmountValidation =
// 	| AuthorizationAmountPayload
// 	| Permit2AmountPayload;

// const getAuthorizationCandidateAmount = (
// 	payload: PaymentPayloadForAmountValidation
// ) => {
// 	if ("authorization" in payload) {
// 		return {
// 			amount: payload.authorization.value,
// 			path: ["paymentPayload", "payload", "authorization", "value"],
// 		};
// 	}

// 	return {
// 		amount: payload.permit2Authorization.permitted.amount,
// 		path: [
// 			"paymentPayload",
// 			"payload",
// 			"permit2Authorization",
// 			"permitted",
// 			"amount",
// 		],
// 	};
// };

// const validateAmountGreaterThanOrEqualToRequired = ({
// 	ctx,
// 	candidateAmount,
// 	requiredAmount,
// 	path,
// }: {
// 	ctx: z.core.$RefinementCtx<unknown>;
// 	candidateAmount: string;
// 	requiredAmount: string;
// 	path: PropertyKey[];
// }) => {
// 	try {
// 		if (BigInt(candidateAmount) <= BigInt(requiredAmount)) {
// 			ctx.addIssue({
// 				code: "custom",
// 				message:
// 					"Authorization amount must be greater than or equal to the required amount",
// 				path,
// 			});
// 		}
// 	} catch {
// 		ctx.addIssue({
// 			code: "custom",
// 			message:
// 				"Authorization amount and required amount must be valid integer strings",
// 			path,
// 		});
// 	}
// };

const verifyOption1RefinedSchema = verifyOption1Schema;
// .superRefine(
// 	(data, ctx) => {
// 		const { amount: candidateAmount, path } = getAuthorizationCandidateAmount(
// 			data.paymentPayload.payload
// 		);

// 		validateAmountGreaterThanOrEqualToRequired({
// 			ctx,
// 			candidateAmount,
// 			requiredAmount: data.paymentRequirements.amount,
// 			path,
// 		});
// 	}
// );

const verifyOption2RefinedSchema = verifyOption2Schema;
// .superRefine(
// 	(data, ctx) => {
// 		const { amount: candidateAmount, path } = getAuthorizationCandidateAmount(
// 			data.paymentPayload.payload
// 		);

// 		validateAmountGreaterThanOrEqualToRequired({
// 			ctx,
// 			candidateAmount,
// 			requiredAmount: data.paymentRequirements.maxAmountRequired,
// 			path,
// 		});
// 	}
// );

export const x402VerifyRequestBodySchema = verifyOption1RefinedSchema.or(
	verifyOption2RefinedSchema
);

export type X402VerifyRequestBody =
	typeof x402VerifyRequestBodySchema._zod.input;

const x402VerifyInvalidReasons = [
	"insufficient_funds",
	"invalid_scheme",
	"invalid_network",
	"invalid_x402_version",
	"invalid_payment_requirements",
	"invalid_payload",
	"invalid_exact_evm_payload_authorization_value",
	"invalid_exact_evm_payload_authorization_value_too_low",
	"invalid_exact_evm_payload_authorization_valid_after",
	"invalid_exact_evm_payload_authorization_valid_before",
	"invalid_exact_evm_payload_authorization_typed_data_message",
	"invalid_exact_evm_payload_authorization_from_address_kyt",
	"invalid_exact_evm_payload_authorization_to_address_kyt",
	"invalid_exact_evm_payload_signature",
	"invalid_exact_evm_payload_signature_address",
	"invalid_exact_evm_permit2_payload_allowance_required",
	"invalid_exact_evm_permit2_payload_signature",
	"invalid_exact_evm_permit2_payload_deadline",
	"invalid_exact_evm_permit2_payload_valid_after",
	"invalid_exact_evm_permit2_payload_spender",
	"invalid_exact_evm_permit2_payload_recipient",
	"invalid_exact_evm_permit2_payload_amount",
	"invalid_exact_svm_payload_transaction",
	"invalid_exact_svm_payload_transaction_amount_mismatch",
	"invalid_exact_svm_payload_transaction_create_ata_instruction",
	"invalid_exact_svm_payload_transaction_create_ata_instruction_incorrect_payee",
	"invalid_exact_svm_payload_transaction_create_ata_instruction_incorrect_asset",
	"invalid_exact_svm_payload_transaction_instructions",
	"invalid_exact_svm_payload_transaction_instructions_length",
	"invalid_exact_svm_payload_transaction_instructions_compute_limit_instruction",
	"invalid_exact_svm_payload_transaction_instructions_compute_price_instruction",
	"invalid_exact_svm_payload_transaction_instructions_compute_price_instruction_too_high",
	"invalid_exact_svm_payload_transaction_instruction_not_spl_token_transfer_checked",
	"invalid_exact_svm_payload_transaction_instruction_not_token_2022_transfer_checked",
	"invalid_exact_svm_payload_transaction_not_a_transfer_instruction",
	"invalid_exact_svm_payload_transaction_cannot_derive_receiver_ata",
	"invalid_exact_svm_payload_transaction_receiver_ata_not_found",
	"invalid_exact_svm_payload_transaction_sender_ata_not_found",
	"invalid_exact_svm_payload_transaction_simulation_failed",
	"invalid_exact_svm_payload_transaction_transfer_to_incorrect_ata",
	"invalid_exact_svm_payload_transaction_fee_payer_included_in_instruction_accounts",
	"invalid_exact_svm_payload_transaction_fee_payer_transferring_funds",
	"unknown_error",
];

// STATUS CODE 200
export const x402VerifyResponseSchema = z
	.object({
		isValid: z.boolean(),
		invalidReason: z.enum(x402VerifyInvalidReasons).optional(),
		invalidMessage: z.string().optional(),
		payer: evmChecksumAddressSchema.or(base58SolanaAddressSchema).optional(),
		extensions: extensionsSchema.optional(),
		extra: extraSchema.optional(),
	})
	.strict();

// STATUS CODE 400
export const x402VerifyClientErrorResponseSchema = z
	.object({
		isValid: z.literal(false),
		invalidReason: z.enum(x402VerifyInvalidReasons),
		invalidMessage: z.string().min(1),
		payer: evmChecksumAddressSchema.or(base58SolanaAddressSchema),
	})
	.strict();

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

// STATUS CODE 500
export const internalServerErrorResponseSchema = z
	.object({
		errorType: z.literal(commonServerErrorPayloadByStatus[500].errorType),
		errorMessage: z.literal(commonServerErrorPayloadByStatus[500].errorMessage),
	})
	.strict();

// STATUS CODE 502
export const badGatewayResponseSchema = z
	.object({
		errorType: z.literal(commonServerErrorPayloadByStatus[502].errorType),
		errorMessage: z.literal(commonServerErrorPayloadByStatus[502].errorMessage),
	})
	.strict();

// STATUS CODE 503
export const serviceUnavailableResponseSchema = z
	.object({
		errorType: z.literal(commonServerErrorPayloadByStatus[503].errorType),
		errorMessage: z.literal(commonServerErrorPayloadByStatus[503].errorMessage),
	})
	.strict();

export const x402VerifyResponseByStatusSchema = {
	200: x402VerifyResponseSchema,
	400: x402VerifyClientErrorResponseSchema,
	500: internalServerErrorResponseSchema,
	502: badGatewayResponseSchema,
	503: serviceUnavailableResponseSchema,
} as const;

export type X402VerifyResponse = typeof x402VerifyResponseSchema._zod.output;

// SETTLE

const settleOption1Schema = z.object({
	x402Version: x402VersionSchema,
	paymentPayload: paymentPayloadOption1Schema,
	paymentRequirements: paymentRequirementsOption1Schema,
});

const settleOption2Schema = z.object({
	x402Version: x402VersionSchema,
	paymentPayload: paymentPayloadOption2Schema,
	paymentRequirements: paymentRequirementsOption2Schema,
});

const settleOption1RefinedSchema = settleOption1Schema;
// .superRefine(
// 	(data, ctx) => {
// 		const { amount: candidateAmount, path } = getAuthorizationCandidateAmount(
// 			data.paymentPayload.payload
// 		);

// 		validateAmountGreaterThanOrEqualToRequired({
// 			ctx,
// 			candidateAmount,
// 			requiredAmount: data.paymentRequirements.amount,
// 			path,
// 		});
// 	}
// );

const settleOption2RefinedSchema = settleOption2Schema;
// .superRefine(
// 	(data, ctx) => {
// 		const { amount: candidateAmount, path } = getAuthorizationCandidateAmount(
// 			data.paymentPayload.payload
// 		);

// 		validateAmountGreaterThanOrEqualToRequired({
// 			ctx,
// 			candidateAmount,
// 			requiredAmount: data.paymentRequirements.maxAmountRequired,
// 			path,
// 		});
// 	}
// );

export const x402SettleRequestBodySchema = settleOption1RefinedSchema.or(
	settleOption2RefinedSchema
);

export type X402SettleRequestBody =
	typeof x402SettleRequestBodySchema._zod.input;

const x402SettleInvalidReasons = [
	"insufficient_funds",
	"invalid_scheme",
	"invalid_network",
	"invalid_x402_version",
	"invalid_payment_requirements",
	"invalid_payload",
	"invalid_exact_evm_payload_authorization_value",
	"invalid_exact_evm_payload_authorization_value_too_low",
	"invalid_exact_evm_payload_authorization_valid_after",
	"invalid_exact_evm_payload_authorization_valid_before",
	"invalid_exact_evm_payload_authorization_typed_data_message",
	"invalid_exact_evm_payload_authorization_from_address_kyt",
	"invalid_exact_evm_payload_authorization_to_address_kyt",
	"invalid_exact_evm_payload_signature",
	"invalid_exact_evm_payload_signature_address",
	"invalid_exact_evm_permit2_payload_allowance_required",
	"invalid_exact_evm_permit2_payload_signature",
	"invalid_exact_evm_permit2_payload_deadline",
	"invalid_exact_evm_permit2_payload_valid_after",
	"invalid_exact_evm_permit2_payload_spender",
	"invalid_exact_evm_permit2_payload_recipient",
	"invalid_exact_evm_permit2_payload_amount",
	"invalid_exact_svm_payload_transaction",
	"invalid_exact_svm_payload_transaction_amount_mismatch",
	"invalid_exact_svm_payload_transaction_create_ata_instruction",
	"invalid_exact_svm_payload_transaction_create_ata_instruction_incorrect_payee",
	"invalid_exact_svm_payload_transaction_create_ata_instruction_incorrect_asset",
	"invalid_exact_svm_payload_transaction_instructions",
	"invalid_exact_svm_payload_transaction_instructions_length",
	"invalid_exact_svm_payload_transaction_instructions_compute_limit_instruction",
	"invalid_exact_svm_payload_transaction_instructions_compute_price_instruction",
	"invalid_exact_svm_payload_transaction_instructions_compute_price_instruction_too_high",
	"invalid_exact_svm_payload_transaction_instruction_not_spl_token_transfer_checked",
	"invalid_exact_svm_payload_transaction_instruction_not_token_2022_transfer_checked",
	"invalid_exact_svm_payload_transaction_not_a_transfer_instruction",
	"invalid_exact_svm_payload_transaction_cannot_derive_receiver_ata",
	"invalid_exact_svm_payload_transaction_receiver_ata_not_found",
	"invalid_exact_svm_payload_transaction_sender_ata_not_found",
	"invalid_exact_svm_payload_transaction_simulation_failed",
	"invalid_exact_svm_payload_transaction_transfer_to_incorrect_ata",
	"invalid_exact_svm_payload_transaction_fee_payer_included_in_instruction_accounts",
	"invalid_exact_svm_payload_transaction_fee_payer_transferring_funds",
	"settle_exact_evm_transaction_confirmation_timed_out",
	"settle_exact_node_failure",
	"settle_exact_failed_onchain",
	"settle_exact_svm_block_height_exceeded",
	"settle_exact_svm_transaction_confirmation_timed_out",
	"unknown_error",
];

// STATUS CODE 200
export const x402SettleResponseSchema = z
	.object({
		success: z.boolean(),
		errorReason: z.enum(x402SettleInvalidReasons).optional(),
		errorMessage: z.string().optional(),
		payer: evmChecksumAddressSchema.or(base58SolanaAddressSchema).optional(),
		transaction: evmTransactionHashSchema.or(base58SolanaTransactionHashSchema),
		network: networkCAIP2Schema,
		amount: z.string().optional(),
		extensions: extensionsSchema.optional(),
		extra: extraSchema.optional(),
	})
	.strict();

// STATUS CODE 400
export const x402SettleClientErrorResponseSchema = z
	.object({
		success: z.literal(false),
		errorReason: z.enum(x402SettleInvalidReasons),
		errorMessage: z.string().min(1),
		payer: evmChecksumAddressSchema.or(base58SolanaAddressSchema).optional(),
	})
	.strict();

// STATUS CODE 402
export const x402SettlePaymentMethodRequiredResponseSchema = z
	.object({
		errorType: z.literal("payment_method_required"),
		errorMessage: z.literal(
			"A valid payment method is required to complete this operation. Please add a payment method to your account"
		),
	})
	.strict();

export const x402SettleResponseByStatusSchema = {
	200: x402SettleResponseSchema,
	400: x402SettleClientErrorResponseSchema,
	402: x402SettlePaymentMethodRequiredResponseSchema,
	500: internalServerErrorResponseSchema,
	502: badGatewayResponseSchema,
	503: serviceUnavailableResponseSchema,
} as const;

export type X402SettleResponse = typeof x402SettleResponseSchema._zod.output;

/////
// SUPPORTED
///

export const tooManyRequestsResponseSchema = z
	.object({
		errorType: z.literal("too_many_requests"),
		errorMessage: z.string().min(1),
	})
	.strict();

export const x402SupportedResponseSchema = z.object({
	kinds: z.array(
		z.object({
			x402Version: x402VersionSchema,
			scheme: schemeSchema,
			network: networkCAIP2Schema,
			extra: extraSchema.optional(),
		})
	),
	extensions: z.array(z.string()),
	signers: z.record(z.string(), z.array(z.string())),
});

export const x402SupportedResponseByStatusSchema = {
	200: x402SupportedResponseSchema,
	429: tooManyRequestsResponseSchema,
	500: internalServerErrorResponseSchema,
	502: badGatewayResponseSchema,
	503: serviceUnavailableResponseSchema,
} as const;
