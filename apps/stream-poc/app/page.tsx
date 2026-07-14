"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
	DEMO_STREAMERS,
	DEMO_VIEWERS,
	getStreamerById,
	getViewerById,
} from "@/lib/identities";
import {
	GLOBAL_TICK_PRICE,
	MINIMUM_DEPOSIT_TICKS,
	MINIMUM_STARTING_DEPOSIT,
	TICK_INTERVAL_MS,
} from "@/lib/price";
import {
	type Delegation,
	delegationSchema,
	WS_SESSION_PATH,
	wsServerMessageSchema,
} from "@/lib/protocol";

type SessionStatus = "idle" | "connecting" | "watching" | "paused" | "closed";

const MAX_LOG_LINES = 12;
const MAX_MEDIA_CHUNKS = 18;

function formatMoney(value: number) {
	return value.toFixed(2);
}

function createDelegation(viewerId: string): Delegation {
	const now = Date.now();
	return delegationSchema.parse({
		sessionId: crypto.randomUUID(),
		sessionKey: crypto.randomUUID(),
		viewerId,
		issuedAt: now,
		expiresAt: now + 24 * 60 * 60 * 1000,
	});
}

function makeVoucherSignature(sessionKey: string, tick: number) {
	return `${sessionKey}:${tick}`;
}

export default function Page() {
	const [isLive, setIsLive] = useState(false);
	const [selectedStreamerId, setSelectedStreamerId] = useState(
		DEMO_STREAMERS[0]?.id ?? ""
	);
	const [selectedViewerId, setSelectedViewerId] = useState(
		DEMO_VIEWERS[0]?.id ?? ""
	);
	const [status, setStatus] = useState<SessionStatus>("idle");
	const [balance, setBalance] = useState(0);
	const [depositInput, setDepositInput] = useState(
		MINIMUM_STARTING_DEPOSIT.toFixed(2)
	);
	const [tickCount, setTickCount] = useState(0);
	const [mediaChunks, setMediaChunks] = useState<string[]>([]);
	const [logs, setLogs] = useState<string[]>([]);

	const socketRef = useRef<WebSocket | null>(null);
	const delegationRef = useRef<Delegation | null>(null);

	const selectedStreamer = useMemo(
		() => getStreamerById(selectedStreamerId),
		[selectedStreamerId]
	);
	const selectedViewer = useMemo(
		() => getViewerById(selectedViewerId),
		[selectedViewerId]
	);

	const appendLog = (line: string) => {
		setLogs((current) => {
			const next = [`${new Date().toLocaleTimeString()} - ${line}`, ...current];
			return next.slice(0, MAX_LOG_LINES);
		});
	};

	const closeSocket = () => {
		if (socketRef.current === null) {
			return;
		}
		socketRef.current.close();
		socketRef.current = null;
	};

	const sendJoin = (deposit: number) => {
		const ws = socketRef.current;
		const delegation = delegationRef.current;
		if (ws === null || delegation === null || selectedViewer === null) {
			return false;
		}

		ws.send(
			JSON.stringify({
				type: "ws:join",
				payload: {
					identity: selectedViewer.id,
					delegation,
					deposit,
				},
			})
		);

		return true;
	};

	const connect = () => {
		if (isLive === false) {
			appendLog("Cannot watch: streamer is offline.");
			return;
		}

		if (selectedViewer === null) {
			appendLog("Cannot watch: select a viewer identity.");
			return;
		}

		const deposit = Number(depositInput);
		if (Number.isFinite(deposit) === false || deposit <= 0) {
			appendLog("Deposit must be a positive number.");
			return;
		}

		closeSocket();
		setStatus("connecting");
		setTickCount(0);
		setMediaChunks([]);
		setBalance(0);

		const delegation = createDelegation(selectedViewer.id);
		delegationRef.current = delegation;

		const scheme = window.location.protocol === "https:" ? "wss" : "ws";
		const ws = new WebSocket(
			`${scheme}://${window.location.host}${WS_SESSION_PATH}`
		);
		socketRef.current = ws;

		ws.addEventListener("open", () => {
			appendLog("Connected to payment session.");
			appendLog("Signed 24h delegation with in-memory session key.");
			sendJoin(deposit);
		});

		ws.addEventListener("message", (event) => {
			let raw: unknown;
			try {
				raw = JSON.parse(String(event.data));
			} catch {
				appendLog("Ignored non-JSON message from server.");
				return;
			}

			const parsed = wsServerMessageSchema.safeParse(raw);
			if (parsed.success === false) {
				appendLog("Ignored unknown message from server.");
				return;
			}

			const message = parsed.data;
			if (message.type === "ws:entitlement") {
				setStatus("watching");
				appendLog(
					`Entitled. Tick every ${Math.round(message.payload.tickInterval / 1000)}s at $${message.payload.price.toFixed(2)}.`
				);
				return;
			}

			if (message.type === "ws:tick") {
				const currentDelegation = delegationRef.current;
				if (currentDelegation === null) {
					return;
				}

				setTickCount(message.payload.tick);
				ws.send(
					JSON.stringify({
						type: "ws:voucher",
						payload: {
							tick: message.payload.tick,
							signature: makeVoucherSignature(
								currentDelegation.sessionKey,
								message.payload.tick
							),
						},
					})
				);
				return;
			}

			if (message.type === "ws:media") {
				setMediaChunks((current) =>
					[message.payload.chunk, ...current].slice(0, MAX_MEDIA_CHUNKS)
				);
				return;
			}

			if (message.type === "ws:session") {
				setBalance(message.payload.balance);
				return;
			}

			if (message.type === "ws:pause") {
				setStatus("paused");
				appendLog(`Playback paused: ${message.payload.reason}.`);
				return;
			}

			if (message.type === "ws:resume") {
				setStatus("watching");
				appendLog("Playback resumed after top-up.");
				return;
			}

			if (message.type === "ws:disconnect") {
				setStatus("closed");
				appendLog("Session disconnected.");
			}
		});

		ws.addEventListener("close", () => {
			setStatus("closed");
			socketRef.current = null;
			appendLog("WebSocket closed.");
		});

		ws.addEventListener("error", () => {
			appendLog("WebSocket error.");
		});
	};

	const handleTopUp = () => {
		const deposit = Number(depositInput);
		if (Number.isFinite(deposit) === false || deposit <= 0) {
			appendLog("Top-up must be a positive number.");
			return;
		}

		const sent = sendJoin(deposit);
		if (sent) {
			appendLog(`Top-up sent: +$${formatMoney(deposit)}.`);
			return;
		}

		appendLog("Top-up failed: no active session.");
	};

	const handleDisconnect = () => {
		if (socketRef.current !== null) {
			socketRef.current.send(
				JSON.stringify({ type: "ws:disconnect", payload: {} })
			);
		}
		closeSocket();
		setStatus("closed");
	};

	useEffect(
		() => () => {
			closeSocket();
		},
		[]
	);

	return (
		<main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 p-6 md:p-10">
			<section className="rounded-xl border border-neutral-800 bg-neutral-950 p-6 text-neutral-100">
				<h1 className="font-semibold text-2xl">Stream POC</h1>
				<p className="mt-2 text-neutral-400 text-sm">
					Raw WebSocket session billing demo with 5s ticks, simulated vouchers,
					and in-memory playback state.
				</p>
			</section>

			<section className="grid gap-4 md:grid-cols-2">
				<div className="rounded-xl border border-neutral-800 bg-neutral-950 p-5 text-neutral-100">
					<h2 className="font-medium text-lg">Streamer</h2>
					<div className="mt-3 block text-neutral-300 text-sm">Identity</div>
					<select
						className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2"
						onChange={(event) => setSelectedStreamerId(event.target.value)}
						value={selectedStreamerId}
					>
						{DEMO_STREAMERS.map((identity) => (
							<option key={identity.id} value={identity.id}>
								{identity.label}
							</option>
						))}
					</select>

					<button
						className="mt-4 rounded-md bg-emerald-600 px-4 py-2 font-semibold text-emerald-50 text-sm"
						onClick={() => {
							setIsLive(true);
							appendLog(
								`Streamer live: ${selectedStreamer?.label ?? "Unknown"}.`
							);
						}}
						type="button"
					>
						Go Live
					</button>
				</div>

				<div className="rounded-xl border border-neutral-800 bg-neutral-950 p-5 text-neutral-100">
					<h2 className="font-medium text-lg">Viewer</h2>
					<div className="mt-3 block text-neutral-300 text-sm">Identity</div>
					<select
						className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2"
						onChange={(event) => setSelectedViewerId(event.target.value)}
						value={selectedViewerId}
					>
						{DEMO_VIEWERS.map((identity) => (
							<option key={identity.id} value={identity.id}>
								{identity.label}
							</option>
						))}
					</select>

					<div className="mt-3 block text-neutral-300 text-sm">
						Deposit (USD sim)
					</div>
					<input
						className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2"
						onChange={(event) => setDepositInput(event.target.value)}
						step="0.01"
						type="number"
						value={depositInput}
					/>

					<div className="mt-4 flex flex-wrap gap-2">
						<button
							className="rounded-md bg-sky-600 px-4 py-2 font-semibold text-sky-50 text-sm"
							onClick={connect}
							type="button"
						>
							Watch
						</button>
						<button
							className="rounded-md bg-amber-600 px-4 py-2 font-semibold text-amber-50 text-sm"
							onClick={handleTopUp}
							type="button"
						>
							Top Up
						</button>
						<button
							className="rounded-md bg-neutral-700 px-4 py-2 font-semibold text-sm"
							onClick={handleDisconnect}
							type="button"
						>
							Disconnect
						</button>
					</div>
				</div>
			</section>

			<section className="grid gap-4 md:grid-cols-3">
				<div className="rounded-xl border border-neutral-800 bg-neutral-950 p-5 text-neutral-200 text-sm">
					<p>Status: {status}</p>
					<p className="mt-1">Live: {isLive ? "yes" : "no"}</p>
					<p className="mt-1">Streamer: {selectedStreamer?.label ?? "n/a"}</p>
					<p className="mt-1">Viewer: {selectedViewer?.label ?? "n/a"}</p>
				</div>

				<div className="rounded-xl border border-neutral-800 bg-neutral-950 p-5 text-neutral-200 text-sm">
					<p>Price / tick: ${GLOBAL_TICK_PRICE.toFixed(2)}</p>
					<p className="mt-1">
						Tick interval: {Math.round(TICK_INTERVAL_MS / 1000)}s
					</p>
					<p className="mt-1">Minimum start: {MINIMUM_DEPOSIT_TICKS} ticks</p>
					<p className="mt-1">Current tick: {tickCount}</p>
					<p className="mt-1">Remaining balance: ${formatMoney(balance)}</p>
				</div>

				<div className="rounded-xl border border-neutral-800 bg-neutral-950 p-5 text-neutral-200 text-sm">
					<p className="font-medium">Session log</p>
					<div className="mt-2 space-y-1">
						{logs.length === 0 ? (
							<p className="text-neutral-400">No events yet.</p>
						) : null}
						{logs.map((line) => (
							<p key={line}>{line}</p>
						))}
					</div>
				</div>
			</section>

			<section className="rounded-xl border border-neutral-800 bg-neutral-950 p-5 text-neutral-100">
				<h2 className="font-medium text-lg">Simulated Player</h2>
				<p className="mt-2 text-neutral-400 text-sm">
					Chunks appear only after each tick voucher is accepted by the server.
				</p>
				<div className="mt-4 space-y-2 rounded-md border border-neutral-800 bg-neutral-900 p-4 font-mono text-sm">
					{mediaChunks.length === 0 ? (
						<p className="text-neutral-500">Waiting for paid chunks...</p>
					) : (
						mediaChunks.map((chunk) => <p key={chunk}>{chunk}</p>)
					)}
				</div>
			</section>
		</main>
	);
}
