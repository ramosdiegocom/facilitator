import type { CharSpec } from "@ramoz/shared/allowed-chars";
import { getCleanTextUnicode } from "@ramoz/shared/allowed-chars";
import { z } from "zod/v4";

export const API_KEY_SCOPES = ["x402:verify", "x402:settle"] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];
export const API_KEY_ACTIVE_LIMIT = 5;
export const DEFAULT_RESOURCE_SERVER_IDENTIFIER = "x402-default";
export const DEFAULT_RESOURCE_SERVER_NAME = "Default Resource Server";

const positiveNumericIdRegex = /^\d+$/;

export const bigintIdFromStringSchema = z
	.string()
	.trim()
	.regex(positiveNumericIdRegex, "Identifier must be a positive integer")
	.transform((value) => BigInt(value));

const apiKeyScopeEnumSchema = z.enum(API_KEY_SCOPES);

export const serializedApiKeyScopesSchema = z
	.string()
	.transform((value, ctx) => {
		const scopes = value
			.split(",")
			.map((scope) => scope.trim())
			.filter(Boolean);

		if (scopes.length === 0) {
			ctx.issues.push({
				code: "custom",
				message: "Scopes cannot be empty",
				input: value,
			});
			return z.NEVER;
		}

		const invalidScopes = scopes.filter(
			(scope) => apiKeyScopeEnumSchema.safeParse(scope).success === false
		);

		if (invalidScopes.length > 0) {
			ctx.issues.push({
				code: "custom",
				message: `Invalid scopes: ${invalidScopes.join(", ")}`,
				input: value,
			});
			return z.NEVER;
		}

		return scopes as ApiKeyScope[];
	});

const spacesRegex = /\s+/g;

export function normalizeApiKeyName(value: string): string {
	return value.trim().replace(spacesRegex, " ");
}

const apiKeyAllowedChars: CharSpec = {
	custom: ["letters", "numbers", "spaces"],
};

export const apiKeyNameSchema = z.string().transform((rawValue, ctx) => {
	const normalized = normalizeApiKeyName(rawValue);

	if (normalized.length === 0) {
		ctx.issues.push({
			code: "custom",
			message: "Key name is required",
			input: rawValue,
		});
		return z.NEVER;
	}

	if (normalized.length > 25) {
		ctx.issues.push({
			code: "custom",
			message: "Key name must be 25 characters or fewer",
			input: rawValue,
		});
		return z.NEVER;
	}

	const cleaned = normalizeApiKeyName(
		getCleanTextUnicode({
			value: normalized,
			chars: apiKeyAllowedChars,
			allowMultipleSpaces: false,
		})
	);

	if (cleaned !== normalized) {
		ctx.issues.push({
			code: "custom",
			message: "Key name can only contain letters, numbers, and spaces",
			input: rawValue,
		});
		return z.NEVER;
	}

	return normalized;
});

export type NormalizedApiKeyName = z.output<typeof apiKeyNameSchema>;
export type ParsedApiKeyScopes = z.output<typeof serializedApiKeyScopesSchema>;
