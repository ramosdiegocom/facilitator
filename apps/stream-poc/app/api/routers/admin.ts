import { createHash } from "node:crypto";
import { ORPCError } from "@orpc/server";
import { auth } from "@ramoz/auth";
import { db } from "@ramoz/db";
import {
	apiKey,
	organization,
	organizationMember,
	resourceServer,
} from "@ramoz/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod/v4";
import {
	generateApiKeySecret,
	getApiKeyPrefix,
	hashApiKeySecret,
} from "@/lib/api-key-secret";
import {
	API_KEY_ACTIVE_LIMIT,
	API_KEY_SCOPES,
	apiKeyNameSchema,
	bigintIdFromStringSchema,
	DEFAULT_RESOURCE_SERVER_IDENTIFIER,
	DEFAULT_RESOURCE_SERVER_NAME,
	serializedApiKeyScopesSchema,
} from "@/lib/api-keys";
import { protectedProcedure } from "./procedures";

/**
 * Admin Router - Resource Server and API Key Management
 *
 * Requires:
 * - Valid session (better-auth passkey auth)
 * - Admin role (all users have admin access in v1)
 */

const authenticatedUserIdSchema = bigintIdFromStringSchema;

function requireUserId(value: string | null) {
	const parsed = authenticatedUserIdSchema.safeParse(value);

	if (parsed.success === false) {
		throw new ORPCError("UNAUTHORIZED", {
			message: "Invalid authenticated user id",
		});
	}

	return parsed.data;
}

function toApiKeyScopes(value: string) {
	const parsed = serializedApiKeyScopesSchema.safeParse(value);

	if (parsed.success === false) {
		throw new ORPCError("INTERNAL_SERVER_ERROR", {
			message: "Persisted API key scopes are invalid",
			data: {
				code: "INVALID_PERSISTED_SCOPES",
				reasons: parsed.error.issues.map((issue) => issue.message),
			},
		});
	}

	return parsed.data;
}

async function ensureOrganizationAndResourceServer(userId: bigint) {
	const organizationSlug = `user-${userId.toString()}`;
	const organizationName = `Workspace ${userId.toString()}`;

	const [upsertedOrganization] = await db
		.insert(organization)
		.values({
			name: organizationName,
			slug: organizationSlug,
		})
		.onConflictDoUpdate({
			target: organization.slug,
			set: {
				name: organizationName,
				updatedAt: new Date(),
			},
		})
		.returning({ id: organization.id, name: organization.name });

	if (!upsertedOrganization) {
		throw new ORPCError("INTERNAL_SERVER_ERROR", {
			message: "Failed to ensure organization",
		});
	}

	await db
		.insert(organizationMember)
		.values({
			organizationId: upsertedOrganization.id,
			userId,
			role: "owner",
		})
		.onConflictDoNothing({
			target: [organizationMember.organizationId, organizationMember.userId],
		});

	const [membership] = await db
		.select({
			organizationId: organizationMember.organizationId,
			organizationName: organization.name,
		})
		.from(organizationMember)
		.innerJoin(
			organization,
			eq(organization.id, organizationMember.organizationId)
		)
		.where(eq(organizationMember.userId, userId))
		.limit(1);

	if (!membership) {
		throw new ORPCError("INTERNAL_SERVER_ERROR", {
			message: "Failed to resolve organization membership",
		});
	}

	await db
		.insert(resourceServer)
		.values({
			organizationId: membership.organizationId,
			name: DEFAULT_RESOURCE_SERVER_NAME,
			identifier: DEFAULT_RESOURCE_SERVER_IDENTIFIER,
		})
		.onConflictDoNothing({
			target: [resourceServer.organizationId, resourceServer.identifier],
		});

	const [resolvedResourceServer] = await db
		.select({
			id: resourceServer.id,
			name: resourceServer.name,
		})
		.from(resourceServer)
		.where(
			and(
				eq(resourceServer.organizationId, membership.organizationId),
				eq(resourceServer.identifier, DEFAULT_RESOURCE_SERVER_IDENTIFIER)
			)
		)
		.limit(1);

	if (!resolvedResourceServer) {
		throw new ORPCError("INTERNAL_SERVER_ERROR", {
			message: "Failed to ensure default resource server",
		});
	}

	return {
		organizationId: membership.organizationId,
		organizationName: membership.organizationName,
		resourceServerId: resolvedResourceServer.id,
		resourceServerName: resolvedResourceServer.name,
	};
}

const ensureProvisioned = protectedProcedure.handler(async ({ context }) => {
	const userId = requireUserId(context.userId);
	const provisioned = await ensureOrganizationAndResourceServer(userId);

	return {
		organizationId: provisioned.organizationId.toString(),
		organizationName: provisioned.organizationName,
		resourceServerId: provisioned.resourceServerId.toString(),
		resourceServerName: provisioned.resourceServerName,
	};
});

const createApiKey = protectedProcedure
	.input(
		z.object({
			name: apiKeyNameSchema,
			resourceServerId: bigintIdFromStringSchema.optional(),
		})
	)
	.handler(async ({ input, context }) => {
		const userId = requireUserId(context.userId);
		const provisioned = await ensureOrganizationAndResourceServer(userId);

		const resourceServerId =
			input.resourceServerId ?? provisioned.resourceServerId;

		const [ownedResourceServer] = await db
			.select({ id: resourceServer.id })
			.from(resourceServer)
			.where(
				and(
					eq(resourceServer.id, resourceServerId),
					eq(resourceServer.organizationId, provisioned.organizationId)
				)
			)
			.limit(1);

		if (!ownedResourceServer) {
			throw new ORPCError("NOT_FOUND", {
				message: "Resource server not found",
			});
		}

		const [{ count }] = await db
			.select({
				count: sql<number>`count(*)::int`,
			})
			.from(apiKey)
			.where(
				and(
					eq(apiKey.organizationId, provisioned.organizationId),
					eq(apiKey.resourceServerId, resourceServerId),
					isNull(apiKey.revokedAt)
				)
			);

		if (count >= API_KEY_ACTIVE_LIMIT) {
			throw new ORPCError("BAD_REQUEST", {
				message: `KEY_LIMIT_REACHED: You can only have ${API_KEY_ACTIVE_LIMIT} active keys. Revoke one to create another.`,
				data: {
					code: "KEY_LIMIT_REACHED",
					max: API_KEY_ACTIVE_LIMIT,
				},
			});
		}

		const secret = generateApiKeySecret();
		const keyHash = hashApiKeySecret(secret);
		const prefix = getApiKeyPrefix(secret);

		const [created] = await db
			.insert(apiKey)
			.values({
				resourceServerId,
				organizationId: provisioned.organizationId,
				name: input.name,
				keyHash,
				keyPrefix: prefix,
				scopes: API_KEY_SCOPES.join(","),
				createdBy: userId,
			})
			.returning({
				id: apiKey.id,
				name: apiKey.name,
				keyPrefix: apiKey.keyPrefix,
				scopes: apiKey.scopes,
				createdAt: apiKey.createdAt,
			});

		if (!created) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Failed to create API key",
			});
		}

		return {
			id: created.id.toString(),
			name: created.name,
			prefix: created.keyPrefix,
			secret,
			scopes: toApiKeyScopes(created.scopes),
			createdAt: created.createdAt,
		};
	});

const listApiKeys = protectedProcedure
	.input(z.object({ resourceServerId: bigintIdFromStringSchema.optional() }))
	.handler(async ({ input, context }) => {
		const userId = requireUserId(context.userId);
		const provisioned = await ensureOrganizationAndResourceServer(userId);

		const resolvedResourceServerId =
			input.resourceServerId ?? provisioned.resourceServerId;

		const [ownedResourceServer] = await db
			.select({ id: resourceServer.id })
			.from(resourceServer)
			.where(
				and(
					eq(resourceServer.id, resolvedResourceServerId),
					eq(resourceServer.organizationId, provisioned.organizationId)
				)
			)
			.limit(1);

		if (!ownedResourceServer) {
			throw new ORPCError("NOT_FOUND", {
				message: "Resource server not found",
			});
		}

		const keys = await db
			.select({
				id: apiKey.id,
				name: apiKey.name,
				prefix: apiKey.keyPrefix,
				scopes: apiKey.scopes,
				createdAt: apiKey.createdAt,
				lastUsedAt: apiKey.lastUsedAt,
				revokedAt: apiKey.revokedAt,
			})
			.from(apiKey)
			.where(
				and(
					eq(apiKey.organizationId, provisioned.organizationId),
					eq(apiKey.resourceServerId, resolvedResourceServerId)
				)
			)
			.orderBy(sql`${apiKey.createdAt} desc`);

		return keys.map((key) => ({
			id: key.id.toString(),
			name: key.name,
			prefix: key.prefix,
			scopes: toApiKeyScopes(key.scopes),
			createdAt: key.createdAt,
			lastUsedAt: key.lastUsedAt,
			revokedAt: key.revokedAt,
			status: key.revokedAt ? ("revoked" as const) : ("active" as const),
		}));
	});

const revokeApiKey = protectedProcedure
	.input(z.object({ keyId: bigintIdFromStringSchema }))
	.handler(async ({ input, context }) => {
		const userId = requireUserId(context.userId);
		const provisioned = await ensureOrganizationAndResourceServer(userId);

		const [existing] = await db
			.select({
				id: apiKey.id,
				revokedAt: apiKey.revokedAt,
			})
			.from(apiKey)
			.where(
				and(
					eq(apiKey.id, input.keyId),
					eq(apiKey.organizationId, provisioned.organizationId)
				)
			)
			.limit(1);

		if (!existing) {
			throw new ORPCError("NOT_FOUND", {
				message: "API key not found",
			});
		}

		if (existing.revokedAt) {
			return { success: true, revokedAt: existing.revokedAt };
		}

		const revokedAt = new Date();
		await db
			.update(apiKey)
			.set({ revokedAt })
			.where(
				and(
					eq(apiKey.id, input.keyId),
					eq(apiKey.organizationId, provisioned.organizationId)
				)
			);

		return { success: true, revokedAt };
	});

const authAuditEventNameSchema = z.enum([
	"auth.passkey.created",
	"auth.passkey.deleted",
	"auth.password.changed",
	"auth.sessions.revoked",
]);

const authAuditOutcomeSchema = z.enum(["success", "failure"]);

const authAuditEventSchema = z.object({
	eventName: authAuditEventNameSchema,
	userId: z.string().min(1),
	sessionId: z.string().nullable(),
	requestId: z.string().nullable(),
	outcome: authAuditOutcomeSchema,
	reasonCode: z.string().nullable(),
	timestamp: z.iso.datetime(),
	metadata: z.record(z.string(), z.unknown()),
});

function hashValue(value: string) {
	return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function createAuthAuditEvent(options: {
	eventName: z.infer<typeof authAuditEventNameSchema>;
	context: {
		userId: string | null;
		requestId: string;
		session: {
			session?: {
				id?: string;
			};
		} | null;
	};
	metadata?: Record<string, unknown>;
	outcome: z.infer<typeof authAuditOutcomeSchema>;
	reasonCode?: string;
}) {
	const event = authAuditEventSchema.parse({
		eventName: options.eventName,
		userId: options.context.userId,
		sessionId: options.context.session?.session?.id ?? null,
		requestId: options.context.requestId,
		outcome: options.outcome,
		reasonCode: options.reasonCode ?? null,
		timestamp: new Date().toISOString(),
		metadata: options.metadata ?? {},
	});

	console.info("[auth-audit]", event);
}

const authSettingsRouter = {
	getAuthSettings: protectedProcedure.handler(async ({ context }) => {
		const passkeys = await auth.api.listPasskeys({
			headers: context.req.headers,
		});

		const sessions = await auth.api.listSessions({
			headers: context.req.headers,
		});

		return {
			currentUserEmail: context.session?.user.email ?? null,
			passkeys: passkeys.map((passkey) => ({
				id: passkey.id,
				name: passkey.name,
				createdAt: passkey.createdAt,
			})),
			otherSessionsCount: Math.max(sessions.length - 1, 0),
		};
	}),

	createPasskey: protectedProcedure
		.input(
			z.object({
				passkeyId: z.string().min(1),
				passkeyName: z.string().nullable(),
			})
		)
		.handler(({ input, context }) => {
			createAuthAuditEvent({
				eventName: "auth.passkey.created",
				context,
				outcome: "success",
				metadata: {
					passkeyIdHash: hashValue(input.passkeyId),
					passkeyName: input.passkeyName,
				},
			});

			return { success: true };
		}),

	deletePasskey: protectedProcedure
		.input(z.object({ passkeyId: z.string().min(1) }))
		.handler(async ({ input, context }) => {
			try {
				await auth.api.deletePasskey({
					body: { id: input.passkeyId },
					headers: context.req.headers,
				});

				createAuthAuditEvent({
					eventName: "auth.passkey.deleted",
					context,
					outcome: "success",
					metadata: {
						passkeyIdHash: hashValue(input.passkeyId),
					},
				});

				const passkeys = await auth.api.listPasskeys({
					headers: context.req.headers,
				});

				return {
					success: true,
					passkeys: passkeys.map((passkey) => ({
						id: passkey.id,
						name: passkey.name,
						createdAt: passkey.createdAt,
					})),
				};
			} catch (error) {
				createAuthAuditEvent({
					eventName: "auth.passkey.deleted",
					context,
					outcome: "failure",
					reasonCode: "PASSKEY_DELETE_FAILED",
					metadata: {
						passkeyIdHash: hashValue(input.passkeyId),
					},
				});

				throw error;
			}
		}),

	changePassword: protectedProcedure
		.input(
			z.object({
				currentPassword: z.string().min(8),
				newPassword: z.string().min(8),
			})
		)
		.handler(async ({ input, context }) => {
			try {
				const sessionsBefore = await auth.api.listSessions({
					headers: context.req.headers,
				});

				await auth.api.changePassword({
					body: {
						currentPassword: input.currentPassword,
						newPassword: input.newPassword,
						revokeOtherSessions: true,
					},
					headers: context.req.headers,
				});

				const sessionsAfter = await auth.api.listSessions({
					headers: context.req.headers,
				});

				const revokedSessionCount = Math.max(
					sessionsBefore.length - sessionsAfter.length,
					0
				);

				createAuthAuditEvent({
					eventName: "auth.password.changed",
					context,
					outcome: "success",
					metadata: {
						revokedSessionCount,
					},
				});

				if (revokedSessionCount > 0) {
					createAuthAuditEvent({
						eventName: "auth.sessions.revoked",
						context,
						outcome: "success",
						metadata: {
							revokedSessionCount,
						},
					});
				}

				return {
					success: true,
					revokedSessionCount,
					message:
						revokedSessionCount > 0
							? `${revokedSessionCount} other session(s) were signed out.`
							: "Your password was updated.",
				};
			} catch (error) {
				createAuthAuditEvent({
					eventName: "auth.password.changed",
					context,
					outcome: "failure",
					reasonCode: "PASSWORD_CHANGE_FAILED",
				});

				throw error;
			}
		}),

	revokeOtherSessions: protectedProcedure.handler(async ({ context }) => {
		try {
			const sessionsBefore = await auth.api.listSessions({
				headers: context.req.headers,
			});

			await auth.api.revokeOtherSessions({
				headers: context.req.headers,
			});

			const sessionsAfter = await auth.api.listSessions({
				headers: context.req.headers,
			});

			const revokedSessionCount = Math.max(
				sessionsBefore.length - sessionsAfter.length,
				0
			);

			createAuthAuditEvent({
				eventName: "auth.sessions.revoked",
				context,
				outcome: "success",
				metadata: {
					revokedSessionCount,
				},
			});

			return { success: true, revokedSessionCount };
		} catch (error) {
			createAuthAuditEvent({
				eventName: "auth.sessions.revoked",
				context,
				outcome: "failure",
				reasonCode: "REVOKE_SESSIONS_FAILED",
			});

			throw error;
		}
	}),
};

/**
 * Export admin router
 */
export const adminRouter = {
	ensureProvisioned,
	createApiKey,
	listApiKeys,
	revokeApiKey,
	authSettings: authSettingsRouter,
};

export type AdminRouter = typeof adminRouter;
