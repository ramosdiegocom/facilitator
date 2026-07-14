import type { IncomingMessage } from "node:http";
import type { Socket as NetSocket } from "node:net";
import WebSocket from "ws";
import {
	GLOBAL_TICK_PRICE,
	MINIMUM_STARTING_DEPOSIT,
	TICK_INTERVAL_MS,
	TOP_UP_GRACE_PERIOD_MS,
} from "../lib/price";
import {
	type Delegation,
	stringifyServerMessage,
	WS_SESSION_PATH,
	type WsClientMessage,
	wsClientMessageSchema,
} from "../lib/protocol";
import { createSimulatedChunk } from "../lib/sim-stream";

type ViewerSession = {
	balance: number;
	delegation: Delegation | null;
	entitled: boolean;
	identity: string | null;
	pendingTick: number | null;
	pendingVoucherTimeout: ReturnType<typeof setTimeout> | null;
	pauseGraceTimeout: ReturnType<typeof setTimeout> | null;
	paused: boolean;
	streamerLabel: string;
	tick: number;
	ticker: ReturnType<typeof setInterval> | null;
};

function parseClientMessage(rawData: unknown): WsClientMessage | null {
	try {
		if (typeof rawData !== "string" && Buffer.isBuffer(rawData) === false) {
			return null;
		}

		const payload =
			typeof rawData === "string" ? rawData : rawData.toString("utf8");
		const parsedJson = JSON.parse(payload);
		const parsedMessage = wsClientMessageSchema.safeParse(parsedJson);

		if (parsedMessage.success === false) {
			return null;
		}

		return parsedMessage.data;
	} catch {
		return null;
	}
}

export type StreamPocWsRuntime = {
	handleUpgrade(
		nodeRequest: IncomingMessage,
		socket: NetSocket,
		head: Buffer
	): boolean;
};

function initialSession(): ViewerSession {
	return {
		balance: 0,
		delegation: null,
		entitled: false,
		identity: null,
		pendingTick: null,
		pendingVoucherTimeout: null,
		pauseGraceTimeout: null,
		paused: false,
		streamerLabel: "Streamer",
		tick: 0,
		ticker: null,
	};
}

function signVoucher(sessionKey: string, tick: number) {
	return `${sessionKey}:${tick}`;
}

export function createStreamPocWsRuntime(): StreamPocWsRuntime {
	const wsServer = new WebSocket.Server({ noServer: true });

	const send = (
		socket: WebSocket,
		message: Parameters<typeof stringifyServerMessage>[0]
	) => {
		socket.send(stringifyServerMessage(message));
	};

	const clearVoucherWait = (session: ViewerSession) => {
		if (session.pendingVoucherTimeout !== null) {
			clearTimeout(session.pendingVoucherTimeout);
			session.pendingVoucherTimeout = null;
		}
		session.pendingTick = null;
	};

	const clearPauseGrace = (session: ViewerSession) => {
		if (session.pauseGraceTimeout !== null) {
			clearTimeout(session.pauseGraceTimeout);
			session.pauseGraceTimeout = null;
		}
	};

	const pauseSession = (
		socket: WebSocket,
		session: ViewerSession,
		reason: string
	) => {
		if (session.paused) {
			return;
		}

		session.paused = true;
		send(socket, { type: "ws:pause", payload: { reason } });
		clearPauseGrace(session);
		session.pauseGraceTimeout = setTimeout(() => {
			send(socket, { type: "ws:disconnect", payload: {} });
			socket.close(4002, "top-up-window-expired");
		}, TOP_UP_GRACE_PERIOD_MS);
	};

	const maybeResume = (socket: WebSocket, session: ViewerSession) => {
		if (session.paused === false) {
			return;
		}
		if (session.balance < GLOBAL_TICK_PRICE) {
			return;
		}

		session.paused = false;
		clearPauseGrace(session);
		send(socket, { type: "ws:resume", payload: {} });
	};

	const cleanup = (session: ViewerSession) => {
		if (session.ticker !== null) {
			clearInterval(session.ticker);
			session.ticker = null;
		}
		clearVoucherWait(session);
		clearPauseGrace(session);
	};

	const onTick = (socket: WebSocket, session: ViewerSession) => {
		if (session.entitled === false || session.paused) {
			return;
		}

		if (session.balance < GLOBAL_TICK_PRICE) {
			pauseSession(socket, session, "insufficient-funds");
			return;
		}

		session.tick += 1;
		session.pendingTick = session.tick;

		send(socket, {
			type: "ws:tick",
			payload: { tick: session.tick, price: GLOBAL_TICK_PRICE },
		});

		session.pendingVoucherTimeout = setTimeout(
			() => {
				pauseSession(socket, session, "voucher-timeout");
				clearVoucherWait(session);
			},
			Math.max(500, TICK_INTERVAL_MS - 500)
		);
	};

	const startTicker = (socket: WebSocket, session: ViewerSession) => {
		if (session.ticker !== null) {
			return;
		}

		session.ticker = setInterval(() => {
			onTick(socket, session);
		}, TICK_INTERVAL_MS);
	};

	wsServer.on("connection", (socket: WebSocket) => {
		const session = initialSession();

		socket.on("message", (rawData: unknown) => {
			const message = parseClientMessage(rawData);
			if (message === null) {
				pauseSession(socket, session, "invalid-message");
				return;
			}

			if (message.type === "ws:disconnect") {
				send(socket, { type: "ws:disconnect", payload: {} });
				socket.close(1000, "client-disconnected");
				return;
			}

			if (message.type === "ws:resume") {
				maybeResume(socket, session);
				return;
			}

			if (message.type === "ws:join") {
				if (message.payload.delegation.expiresAt <= Date.now()) {
					pauseSession(socket, session, "delegation-expired");
					return;
				}

				if (
					session.delegation !== null &&
					session.delegation.sessionId !== message.payload.delegation.sessionId
				) {
					pauseSession(socket, session, "delegation-mismatch");
					return;
				}

				session.identity = message.payload.identity;
				session.delegation = message.payload.delegation;
				session.streamerLabel = "Live Channel";
				session.balance += message.payload.deposit;

				if (session.entitled === false) {
					if (session.balance < MINIMUM_STARTING_DEPOSIT) {
						pauseSession(socket, session, "minimum-deposit-not-met");
						send(socket, {
							type: "ws:session",
							payload: { balance: session.balance, chargedTick: session.tick },
						});
						return;
					}

					session.entitled = true;
					send(socket, {
						type: "ws:entitlement",
						payload: {
							ok: true,
							price: GLOBAL_TICK_PRICE,
							tickInterval: TICK_INTERVAL_MS,
						},
					});
					startTicker(socket, session);
				}

				send(socket, {
					type: "ws:session",
					payload: { balance: session.balance, chargedTick: session.tick },
				});
				maybeResume(socket, session);
				return;
			}

			if (message.type === "ws:voucher") {
				if (session.delegation === null || session.pendingTick === null) {
					pauseSession(socket, session, "voucher-without-tick");
					return;
				}
				if (message.payload.tick !== session.pendingTick) {
					pauseSession(socket, session, "tick-mismatch");
					return;
				}

				const expectedSignature = signVoucher(
					session.delegation.sessionKey,
					message.payload.tick
				);
				if (message.payload.signature !== expectedSignature) {
					pauseSession(socket, session, "invalid-voucher");
					return;
				}

				clearVoucherWait(session);
				session.balance = Math.max(0, session.balance - GLOBAL_TICK_PRICE);
				send(socket, {
					type: "ws:media",
					payload: {
						tick: message.payload.tick,
						chunk: createSimulatedChunk(
							message.payload.tick,
							session.streamerLabel
						),
					},
				});
				send(socket, {
					type: "ws:session",
					payload: {
						balance: session.balance,
						chargedTick: message.payload.tick,
					},
				});

				if (session.balance < GLOBAL_TICK_PRICE) {
					pauseSession(socket, session, "insufficient-funds");
				}
			}
		});

		socket.on("close", () => {
			cleanup(session);
		});

		socket.on("error", () => {
			cleanup(session);
		});
	});

	return {
		handleUpgrade(
			nodeRequest: IncomingMessage,
			socket: NetSocket,
			head: Buffer
		): boolean {
			const host = nodeRequest.headers.host ?? "127.0.0.1:3000";
			const url = new URL(nodeRequest.url ?? "/", `http://${host}`);

			if (url.pathname !== WS_SESSION_PATH) {
				return false;
			}

			wsServer.handleUpgrade(
				nodeRequest,
				socket,
				head,
				(websocket: WebSocket) => {
					wsServer.emit("connection", websocket, nodeRequest);
				}
			);
			return true;
		},
	};
}
