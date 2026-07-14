import z from "zod/v4";

export const WS_SESSION_PATH = "/ws/session";

export const delegationSchema = z.object({
	sessionId: z.string().min(1),
	sessionKey: z.string().min(1),
	viewerId: z.string().min(1),
	issuedAt: z.number().int().nonnegative(),
	expiresAt: z.number().int().positive(),
});

const joinPayloadSchema = z.object({
	identity: z.string().min(1),
	delegation: delegationSchema,
	deposit: z.number().positive(),
});

const voucherPayloadSchema = z.object({
	tick: z.number().int().positive(),
	signature: z.string().min(1),
});

export const wsClientMessageSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("ws:join"), payload: joinPayloadSchema }),
	z.object({ type: z.literal("ws:voucher"), payload: voucherPayloadSchema }),
	z.object({ type: z.literal("ws:resume"), payload: z.object({}) }),
	z.object({ type: z.literal("ws:disconnect"), payload: z.object({}) }),
]);

const entitlementPayloadSchema = z.object({
	ok: z.literal(true),
	price: z.number().positive(),
	tickInterval: z.number().int().positive(),
});

const tickPayloadSchema = z.object({
	tick: z.number().int().positive(),
	price: z.number().positive(),
});

const pausePayloadSchema = z.object({
	reason: z.string().min(1),
});

const mediaPayloadSchema = z.object({
	tick: z.number().int().positive(),
	chunk: z.string().min(1),
});

const sessionPayloadSchema = z.object({
	balance: z.number().nonnegative(),
	chargedTick: z.number().int().nonnegative(),
});

export const wsServerMessageSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("ws:entitlement"), payload: entitlementPayloadSchema }),
	z.object({ type: z.literal("ws:tick"), payload: tickPayloadSchema }),
	z.object({ type: z.literal("ws:pause"), payload: pausePayloadSchema }),
	z.object({ type: z.literal("ws:resume"), payload: z.object({}) }),
	z.object({ type: z.literal("ws:media"), payload: mediaPayloadSchema }),
	z.object({ type: z.literal("ws:session"), payload: sessionPayloadSchema }),
	z.object({ type: z.literal("ws:disconnect"), payload: z.object({}) }),
]);

export type Delegation = z.infer<typeof delegationSchema>;
export type WsClientMessage = z.infer<typeof wsClientMessageSchema>;
export type WsServerMessage = z.infer<typeof wsServerMessageSchema>;

export function stringifyServerMessage(message: WsServerMessage) {
	return JSON.stringify(message);
}
