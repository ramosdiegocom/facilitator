import { ORPCError, os } from "@orpc/server";
import { auth } from "@ramoz/auth";
import { db } from "@ramoz/db";
import { apiKey } from "@ramoz/db/schema";
import { env } from "@ramoz/env/server";
import { Redis } from "@upstash/redis";
import { and, eq, isNull } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { z } from "zod/v4";
import { hashApiKeySecret, keyHashMatches } from "@/lib/api-key-secret";
import { serializedApiKeyScopesSchema } from "@/lib/api-keys";

const BEARER_REGEX = /^Bearer\s+(.+)$/i;
const authorizationHeaderSchema = z
	.string()
	.transform((value) => {
		const match = BEARER_REGEX.exec(value);
		return match?.[1]?.trim() ?? "";
	})
	.refine((token) => token.length > 0, {
		message: "Authorization header must be in the format: Bearer <token>",
	});

export type PublicContext = {
	req: NextRequest;
	apiKey: {
		id: string;
		resourceServerId: string;
		organizationId: string;
		scopes: string[];
		expiresAt: Date | null;
		revokedAt: Date | null;
	} | null;
	requestId: string;
};

type Session = Awaited<ReturnType<typeof auth.api.getSession>>;

export type AdminContext = {
	req: NextRequest;
	session: Session | null;
	userId: string | null;
	organizationId: string | null;
	requestId: string;
};

/**
 * Create public context from NextRequest
 * Validates API key from Authorization header
 */
export async function createPublicContext(
	req: NextRequest
): Promise<PublicContext> {
	const requestId = crypto.randomUUID();
	const authHeader = req.headers.get("authorization") ?? "";

	let resolvedApiKeyContext: PublicContext["apiKey"] = null;

	const parsedToken = authorizationHeaderSchema.safeParse(authHeader);
	if (parsedToken.success) {
		const token = parsedToken.data;
		const tokenHash = hashApiKeySecret(token);

		const [resolvedApiKey] = await db
			.select({
				id: apiKey.id,
				resourceServerId: apiKey.resourceServerId,
				organizationId: apiKey.organizationId,
				scopes: apiKey.scopes,
				revokedAt: apiKey.revokedAt,
				keyHash: apiKey.keyHash,
			})
			.from(apiKey)
			.where(and(eq(apiKey.keyHash, tokenHash), isNull(apiKey.revokedAt)))
			.limit(1);

		if (resolvedApiKey && keyHashMatches(token, resolvedApiKey.keyHash)) {
			const parsedScopes = serializedApiKeyScopesSchema.safeParse(
				resolvedApiKey.scopes
			);

			if (parsedScopes.success) {
				await db
					.update(apiKey)
					.set({ lastUsedAt: new Date() })
					.where(eq(apiKey.id, resolvedApiKey.id));

				resolvedApiKeyContext = {
					id: resolvedApiKey.id.toString(),
					resourceServerId: resolvedApiKey.resourceServerId.toString(),
					organizationId: resolvedApiKey.organizationId.toString(),
					scopes: parsedScopes.data,
					expiresAt: null,
					revokedAt: resolvedApiKey.revokedAt,
				};
			} else {
				console.warn("[Public API] Invalid persisted scopes for api key", {
					requestId,
					apiKeyId: resolvedApiKey.id.toString(),
					reasons: parsedScopes.error.issues.map((issue) => issue.message),
				});
			}
		}
	}

	return {
		req,
		apiKey: resolvedApiKeyContext,
		requestId,
	};
}

/**
 * Create admin context from NextRequest
 * Validates session from better-auth
 */
export async function createAdminContext(
	req: NextRequest
): Promise<AdminContext> {
	const requestId = crypto.randomUUID();

	try {
		const session = await auth.api.getSession({ headers: req.headers });

		return {
			req,
			session,
			userId: session?.user?.id || null,
			organizationId: null, // TODO: Get from session context
			requestId,
		};
	} catch {
		return {
			req,
			session: null,
			userId: null,
			organizationId: null,
			requestId,
		};
	}
}

/**
 * Public oRPC procedures (API key auth)
 */
export const publicO = os.$context<PublicContext>();

const requireApiKey = publicO.middleware(({ context, next }) => {
	if (!context.apiKey) {
		throw new ORPCError("UNAUTHORIZED");
	}
	return next({ context });
});

export const apiKeyProcedure = publicO.use(requireApiKey);

const RATE_LIMIT_CONFIG_SCHEMA = z.object({
	keyPrefix: z.string().min(1),
	maxRequests: z.int().positive(),
	windowSeconds: z.int().positive(),
	blockSeconds: z.int().positive().default(60),
	timeoutMs: z.int().positive().max(5000).default(300),
	tooManyRequestsMessage: z
		.string()
		.min(1)
		.default("Too many requests for this endpoint"),
	serviceUnavailableMessage: z
		.string()
		.min(1)
		.default("Rate limiter unavailable"),
});

type RateLimitConfig = z.infer<typeof RATE_LIMIT_CONFIG_SCHEMA>;
type RateLimitConfigInput = z.input<typeof RATE_LIMIT_CONFIG_SCHEMA>;

const redis = new Redis({
	url: env.UPSTASH_REDIS_REST_URL,
	token: env.UPSTASH_REDIS_REST_TOKEN,
});

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			reject(new Error("Upstash rate limiter timeout"));
		}, timeoutMs);

		promise
			.then((value) => {
				clearTimeout(timeout);
				resolve(value);
			})
			.catch((error) => {
				clearTimeout(timeout);
				reject(error);
			});
	});
}

function getClientAddress(req: NextRequest): string {
	if (env.TRUST_PROXY_HEADERS === false) {
		return "unknown";
	}

	const forwardedFor = req.headers.get("x-forwarded-for");
	if (forwardedFor) {
		const [firstAddress] = forwardedFor.split(",");
		if (firstAddress?.trim()) {
			return firstAddress.trim();
		}
	}

	const realIp = req.headers.get("x-real-ip");
	if (realIp?.trim()) {
		return realIp.trim();
	}

	return "unknown";
}

function withRateLimitTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number
): Promise<T> {
	return withTimeout(promise, timeoutMs);
}

function getRateLimitKeys(config: RateLimitConfig, clientIp: string) {
	return {
		rateKey: `${config.keyPrefix}:rate:${clientIp}`,
		blockKey: `${config.keyPrefix}:block:${clientIp}`,
	};
}

async function persistBlockKeyBestEffort(options: {
	blockKey: string;
	blockSeconds: number;
	timeoutMs: number;
	requestId: string;
	clientIp: string;
	requestPath: string;
	policy: string;
}) {
	const {
		blockKey,
		blockSeconds,
		timeoutMs,
		requestId,
		clientIp,
		requestPath,
		policy,
	} = options;

	try {
		await withRateLimitTimeout(
			redis.set(blockKey, "1", { ex: blockSeconds }),
			timeoutMs
		);
	} catch (setBlockError) {
		// Best-effort block cache write: do not downgrade a true rate-limit rejection to 503.
		console.warn("[Public API][rate-limit] failed to persist block key", {
			requestId,
			clientIp,
			requestPath,
			policy,
			error: setBlockError instanceof Error ? setBlockError.message : "unknown",
		});
	}
}

export function createPublicRateLimitMiddleware(
	configInput: RateLimitConfigInput
) {
	const config = RATE_LIMIT_CONFIG_SCHEMA.parse(configInput);
	const windowMs = config.windowSeconds * 1000;

	return publicO.middleware(async ({ context, next }) => {
		const now = Date.now();
		const clientIp = getClientAddress(context.req);
		const userAgent = context.req.headers.get("user-agent") || "unknown-agent";
		const requestPath = context.req.nextUrl.pathname;
		const { rateKey, blockKey } = getRateLimitKeys(config, clientIp);

		try {
			const isBlocked = await withRateLimitTimeout(
				redis.get<string>(blockKey),
				config.timeoutMs
			);

			if (isBlocked) {
				console.warn("[Public API][rate-limit] blocked client", {
					requestId: context.requestId,
					clientIp,
					requestPath,
					policy: config.keyPrefix,
					userAgent,
				});

				throw new ORPCError("TOO_MANY_REQUESTS", {
					message: config.tooManyRequestsMessage,
				});
			}

			const windowStart = now - windowMs;
			const member = `${now}:${context.requestId}`;

			const result = await withRateLimitTimeout(
				redis
					.pipeline()
					.zremrangebyscore(rateKey, 0, windowStart)
					.zadd(rateKey, { score: now, member })
					.zcard(rateKey)
					.expire(rateKey, Math.ceil((windowMs * 2) / 1000))
					.exec(),
				config.timeoutMs
			);

			const requestCountResult = result[2];
			const requestCount =
				typeof requestCountResult === "number"
					? requestCountResult
					: Number(requestCountResult);

			if (!Number.isFinite(requestCount)) {
				throw new Error("Invalid Upstash rate limiter response");
			}

			if (requestCount <= config.maxRequests) {
				return next({ context });
			}

			await persistBlockKeyBestEffort({
				blockKey,
				blockSeconds: config.blockSeconds,
				timeoutMs: config.timeoutMs,
				requestId: context.requestId,
				clientIp,
				requestPath,
				policy: config.keyPrefix,
			});

			console.warn("[Public API][rate-limit] abuse detected", {
				requestId: context.requestId,
				clientIp,
				requestPath,
				windowCount: requestCount,
				maxPerWindow: config.maxRequests,
				blockedForSeconds: config.blockSeconds,
				policy: config.keyPrefix,
				userAgent,
			});

			throw new ORPCError("TOO_MANY_REQUESTS", {
				message: config.tooManyRequestsMessage,
			});
		} catch (error) {
			if (error instanceof ORPCError) {
				throw error;
			}

			console.error("[Public API][rate-limit] limiter unavailable", {
				requestId: context.requestId,
				clientIp,
				requestPath,
				policy: config.keyPrefix,
				error: error instanceof Error ? error.message : "unknown",
			});

			throw new ORPCError("SERVICE_UNAVAILABLE", {
				message: config.serviceUnavailableMessage,
			});
		}
	});
}

/**
 * Admin oRPC procedures (session auth)
 */
export const adminO = os.$context<AdminContext>();

const requireAuth = adminO.middleware(({ context, next }) => {
	if (!context.userId) {
		throw new ORPCError("UNAUTHORIZED");
	}
	return next({ context });
});

export const protectedProcedure = adminO.use(requireAuth);
