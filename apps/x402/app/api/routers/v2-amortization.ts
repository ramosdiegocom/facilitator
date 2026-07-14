import { ORPCError } from "@orpc/server";
import z from "zod/v4";
import {
	amortizationResponseSchema,
	amortizationValidationErrorSchema,
	calculateAmortizationSchedule,
} from "@/app/api/routers/amortization";
import { publicO } from "@/app/api/routers/procedures";
import { x402SettleResponseByStatusSchema } from "@/app/api/routers/schemas";

/**
 * Calculate deterministic mortgage amortization schedule
 */
const amortization = publicO
	.route({
		method: "POST",
		path: "/amortization",
		summary: "Calculate mortgage amortization schedule",
	})
	.output(amortizationResponseSchema)
	.errors({
		BAD_REQUEST: {
			status: 400,
			data: amortizationValidationErrorSchema,
		},
		INTERNAL_SERVER_ERROR: {
			status: 500,
			data: x402SettleResponseByStatusSchema[500],
		},
	})
	// The procedure performs explicit schema validation to guarantee a stable
	// field-level error shape for agent clients.
	.input(z.unknown())
	.handler(({ input }) => {
		try {
			return calculateAmortizationSchedule(input);
		} catch (error) {
			if (error instanceof ORPCError) {
				throw error;
			}

			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				status: 500,
				data: x402SettleResponseByStatusSchema[500].parse({
					errorType: "internal_server_error",
					errorMessage:
						"An internal server error occurred. Please try again later.",
				}),
			});
		}
	});

export const amortizationRouter = {
	amortization,
};
