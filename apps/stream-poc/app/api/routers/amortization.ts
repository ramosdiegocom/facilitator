import { ORPCError } from "@orpc/server";
import z from "zod/v4";

const INPUT_BOUNDS = {
	loanAmountCents: { min: 10_000, max: 100_000_000_000 },
	annualRateBps: { min: 0, max: 10_000 },
	termMonths: { min: 1, max: 600 },
} as const;

const startDateRegex = /^\d{4}-\d{2}-\d{2}$/;
const algorithmVersion = "v1.0.0";
const roundingMode = "HALF_UP_CENTS";

export const amortizationInputSchema = z
	.object({
		loanAmountCents: z
			.int()
			.min(INPUT_BOUNDS.loanAmountCents.min)
			.max(INPUT_BOUNDS.loanAmountCents.max),
		annualRateBps: z
			.int()
			.min(INPUT_BOUNDS.annualRateBps.min)
			.max(INPUT_BOUNDS.annualRateBps.max),
		termMonths: z
			.int()
			.min(INPUT_BOUNDS.termMonths.min)
			.max(INPUT_BOUNDS.termMonths.max),
		startDate: z.string().regex(startDateRegex),
	})
	.strict();

export const amortizationScheduleEntrySchema = z
	.object({
		period: z.int().min(1),
		dueDate: z.string().regex(startDateRegex),
		paymentCents: z.int().min(0),
		principalCents: z.int().min(0),
		interestCents: z.int().min(0),
		balanceCents: z.int().min(0),
	})
	.strict();

export const amortizationResponseSchema = z
	.object({
		input: amortizationInputSchema,
		summary: z
			.object({
				regularPaymentCents: z.int().min(0),
				totalPrincipalCents: z.int().min(0),
				totalInterestCents: z.int().min(0),
				totalPaymentCents: z.int().min(0),
			})
			.strict(),
		schedule: z.array(amortizationScheduleEntrySchema),
		meta: z
			.object({
				algorithmVersion: z.literal(algorithmVersion),
				roundingMode: z.literal(roundingMode),
			})
			.strict(),
	})
	.strict();

export const amortizationValidationErrorSchema = z
	.object({
		errorType: z.literal("validation_error"),
		fieldErrors: z
			.array(
				z
					.object({
						field: z.string(),
						message: z.string(),
					})
					.strict()
			)
			.min(1),
	})
	.strict();

const toDateParts = (value: string) => {
	const [year, month, day] = value.split("-").map(Number);

	if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
		return null;
	}

	const date = new Date(Date.UTC(year, month - 1, day));
	if (
		date.getUTCFullYear() !== year ||
		date.getUTCMonth() !== month - 1 ||
		date.getUTCDate() !== day
	) {
		return null;
	}

	return { year, month, day };
};

const pad2 = (value: number) => value.toString().padStart(2, "0");

const formatDate = (year: number, month: number, day: number) =>
	`${year}-${pad2(month)}-${pad2(day)}`;

const lastDayOfMonth = (year: number, month: number) => {
	const date = new Date(Date.UTC(year, month, 0));
	return date.getUTCDate();
};

const addMonthsClamped = (startDate: string, monthsToAdd: number) => {
	const parts = toDateParts(startDate);
	if (!parts) {
		return null;
	}

	const monthIndex = parts.month - 1 + monthsToAdd;
	const targetYear = parts.year + Math.floor(monthIndex / 12);
	const targetMonth = (monthIndex % 12) + 1;
	const targetDay = Math.min(
		parts.day,
		lastDayOfMonth(targetYear, targetMonth)
	);

	return formatDate(targetYear, targetMonth, targetDay);
};

const roundHalfUpCents = (value: number) => Math.floor(value + 0.5);

export const toValidationError = (
	error: z.ZodError
): z.infer<typeof amortizationValidationErrorSchema> => {
	const fieldErrors = error.issues.map((issue) => ({
		field:
			issue.path.length > 0
				? issue.path.map((part) => String(part)).join(".")
				: "request",
		message: issue.message,
	}));

	return {
		errorType: "validation_error",
		fieldErrors,
	};
};

export const calculateAmortizationSchedule = (
	rawInput: unknown
): z.infer<typeof amortizationResponseSchema> => {
	const parsed = amortizationInputSchema.safeParse(rawInput);
	if (!parsed.success) {
		throw new ORPCError("BAD_REQUEST", {
			status: 400,
			data: amortizationValidationErrorSchema.parse(
				toValidationError(parsed.error)
			),
		});
	}

	const input = parsed.data;
	if (!toDateParts(input.startDate)) {
		throw new ORPCError("BAD_REQUEST", {
			status: 400,
			data: {
				errorType: "validation_error",
				fieldErrors: [{ field: "startDate", message: "Invalid calendar date" }],
			},
		});
	}

	const monthlyRate = input.annualRateBps / 120_000;
	const regularPaymentCents =
		monthlyRate === 0
			? roundHalfUpCents(input.loanAmountCents / input.termMonths)
			: roundHalfUpCents(
					(input.loanAmountCents * monthlyRate) /
						(1 - (1 + monthlyRate) ** -input.termMonths)
				);

	let balanceCents = input.loanAmountCents;
	let totalPrincipalCents = 0;
	let totalInterestCents = 0;
	let totalPaymentCents = 0;

	const schedule: z.infer<typeof amortizationScheduleEntrySchema>[] = [];

	for (let period = 1; period <= input.termMonths; period += 1) {
		const dueDate = addMonthsClamped(input.startDate, period);
		if (!dueDate) {
			throw new ORPCError("BAD_REQUEST", {
				status: 400,
				data: {
					errorType: "validation_error",
					fieldErrors: [
						{ field: "startDate", message: "Invalid calendar date" },
					],
				},
			});
		}

		const interestCents = roundHalfUpCents(balanceCents * monthlyRate);
		let principalCents = regularPaymentCents - interestCents;
		let paymentCents = regularPaymentCents;

		if (period === input.termMonths || principalCents > balanceCents) {
			principalCents = balanceCents;
			paymentCents = principalCents + interestCents;
		}

		if (principalCents < 0) {
			principalCents = 0;
		}

		balanceCents -= principalCents;
		if (balanceCents < 0) {
			balanceCents = 0;
		}

		totalPrincipalCents += principalCents;
		totalInterestCents += interestCents;
		totalPaymentCents += paymentCents;

		schedule.push({
			period,
			dueDate,
			paymentCents,
			principalCents,
			interestCents,
			balanceCents,
		});
	}

	const response = {
		input,
		summary: {
			regularPaymentCents,
			totalPrincipalCents,
			totalInterestCents,
			totalPaymentCents,
		},
		schedule,
		meta: {
			algorithmVersion,
			roundingMode,
		},
	};

	return amortizationResponseSchema.parse(response);
};
