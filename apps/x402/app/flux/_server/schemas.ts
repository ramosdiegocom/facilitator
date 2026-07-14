import z from "zod/v4";

export const fluxEnvSchema = z.object({
	FLUX_SERVER_PRIVATE_KEY: z
		.string()
		.regex(/^0x[0-9a-fA-F]{64}$/)
		.optional(),
	FLUX_STREAM_PRICE_PER_TOKEN: z
		.string()
		.regex(/^\d+(\.\d+)?$/)
		.default("0.000075"),
	FLUX_STREAM_MAX_TOKENS: z.coerce.number().int().min(1).max(200).default(60),
	FLUX_STREAM_MAX_DEPOSIT: z
		.string()
		.regex(/^\d+(\.\d+)?$/)
		.default("1"),
	FLUX_STREAM_CURRENCY: z
		.string()
		.regex(/^0x[0-9a-fA-F]{40}$/)
		.default("0x20c0000000000000000000000000000000000000"),
	FLUX_STREAM_UNIT_TYPE: z.string().min(1).max(32).default("token"),
});

export const streamQuerySchema = z.object({
	prompt: z
		.string()
		.min(1)
		.max(240)
		.default("Write a tiny poem about metered APIs."),
});

export const streamInfoSchema = z.object({
	recipient: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
	currency: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
	pricePerToken: z.string().regex(/^\d+(\.\d+)?$/),
	maxDeposit: z.string().regex(/^\d+(\.\d+)?$/),
	unitType: z.string().min(1),
	ssePath: z.string().min(1),
});

export const estimateInputSchema = z.object({
	tokens: z.number().int().min(1).max(200),
});
