import { describe, expect, it } from "bun:test";
import { ORPCError } from "@orpc/server";
import { calculateAmortizationSchedule } from "./amortization";

describe("calculateAmortizationSchedule", () => {
	it("returns deterministic output for fixed-rate mortgage vector", () => {
		const input = {
			loanAmountCents: 10_000_000,
			annualRateBps: 500,
			termMonths: 360,
			startDate: "2026-01-31",
		};

		const first = calculateAmortizationSchedule(input);
		const second = calculateAmortizationSchedule(input);

		expect(JSON.stringify(first)).toBe(JSON.stringify(second));
		expect(first.summary.regularPaymentCents).toBe(53_682);
		expect(first.summary.totalInterestCents).toBe(9_325_652);
		expect(first.summary.totalPaymentCents).toBe(19_325_652);
		expect(first.schedule[0]).toEqual({
			period: 1,
			dueDate: "2026-02-28",
			paymentCents: 53_682,
			principalCents: 12_015,
			interestCents: 41_667,
			balanceCents: 9_987_985,
		});
		expect(first.schedule[1]).toEqual({
			period: 2,
			dueDate: "2026-03-31",
			paymentCents: 53_682,
			principalCents: 12_065,
			interestCents: 41_617,
			balanceCents: 9_975_920,
		});
		expect(first.schedule.at(-1)).toEqual({
			period: 360,
			dueDate: "2056-01-31",
			paymentCents: 53_814,
			principalCents: 53_591,
			interestCents: 223,
			balanceCents: 0,
		});
		expect(first.meta.algorithmVersion).toBe("v1.0.0");
		expect(first.meta.roundingMode).toBe("HALF_UP_CENTS");
	});

	it("handles zero-rate loans and end-of-month clamping", () => {
		const output = calculateAmortizationSchedule({
			loanAmountCents: 120_000,
			annualRateBps: 0,
			termMonths: 12,
			startDate: "2026-02-28",
		});

		expect(output.summary.regularPaymentCents).toBe(10_000);
		expect(output.summary.totalInterestCents).toBe(0);
		expect(output.summary.totalPaymentCents).toBe(120_000);
		expect(output.schedule[0].dueDate).toBe("2026-03-28");
		expect(output.schedule.at(-1)?.dueDate).toBe("2027-02-28");
		expect(output.schedule.every((item) => item.balanceCents >= 0)).toBe(true);
	});

	it("returns stable validation error shape", () => {
		let thrown: unknown;
		try {
			calculateAmortizationSchedule({
				loanAmountCents: 5000,
				annualRateBps: 20_000,
				termMonths: 0,
				startDate: "not-a-date",
			});
		} catch (error) {
			thrown = error;
		}

		expect(thrown).toBeInstanceOf(ORPCError);
		if (!(thrown instanceof ORPCError)) {
			throw new Error("Expected ORPCError");
		}

		const err = thrown;
		expect(err.code).toBe("BAD_REQUEST");
		expect(err.data).toMatchObject({
			errorType: "validation_error",
		});
		expect(
			Array.isArray((err.data as { fieldErrors: unknown[] }).fieldErrors)
		).toBe(true);
	});
});
