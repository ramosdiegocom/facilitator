"use client";

import { tempo } from "mppx/client";
import { useMemo, useState } from "react";
import { createClient, http } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { Chain } from "viem/tempo";

const DEFAULT_MAX_DEPOSIT = "1";
const DEFAULT_PROMPT = "Explain why WebSocket metering is useful.";

type WsState = "idle" | "streaming" | "done" | "error";

type SessionRuntime = {
	account: ReturnType<typeof privateKeyToAccount>;
	session: ReturnType<typeof tempo.session>;
};

function createRuntime(): SessionRuntime {
	const privateKey = generatePrivateKey();
	const account = privateKeyToAccount(privateKey);
	const client = createClient({
		account,
		chain: Chain.testnet,
		pollingInterval: 1000,
		transport: http(),
	});

	return {
		account,
		session: tempo.session({
			account,
			client,
			maxDeposit: DEFAULT_MAX_DEPOSIT,
			webSocket: WebSocket,
		}),
	};
}

export function WsDemoClient() {
	const runtime = useMemo(() => createRuntime(), []);
	const [state, setState] = useState<WsState>("idle");
	const [error, setError] = useState<string | null>(null);
	const [output, setOutput] = useState("");

	async function startStream() {
		if (state === "streaming") {
			return;
		}

		setState("streaming");
		setError(null);
		setOutput("");

		const url = new URL("/flux/ws", window.location.origin);
		url.searchParams.set("prompt", DEFAULT_PROMPT);

		try {
			const socket = await runtime.session.ws(url);

			await new Promise<void>((resolve, reject) => {
				socket.addEventListener("message", (event) => {
					if (typeof event.data !== "string") {
						return;
					}

					setOutput((current) => `${current}${event.data}`);
				});

				socket.addEventListener(
					"close",
					() => {
						resolve();
					},
					{ once: true }
				);

				socket.addEventListener(
					"error",
					() => {
						reject(new Error("WebSocket stream failed."));
					},
					{ once: true }
				);
			});

			setState("done");
		} catch (streamError) {
			setState("error");
			setError(
				streamError instanceof Error
					? streamError.message
					: "Unknown stream error"
			);
		} finally {
			try {
				await runtime.session.close();
			} catch {
				// noop
			}

			setState((current) => (current === "streaming" ? "done" : current));
		}
	}

	return (
		<div className="mx-auto w-full max-w-4xl space-y-6 px-6 py-12">
			<div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
				<p className="font-semibold text-slate-600 text-xs uppercase tracking-[0.16em]">
					WebSocket Metered Demo
				</p>
				<h1 className="mt-2 font-semibold text-3xl text-slate-900">
					Single-process website flow
				</h1>
				<p className="mt-3 text-slate-600 text-sm leading-6">
					Send testnet funds to this ephemeral payer address, then start stream.
				</p>
				<p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-slate-900 text-sm">
					{runtime.account.address}
				</p>
			</div>

			<div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
				<label
					className="block font-medium text-slate-700 text-sm"
					htmlFor="prompt"
				>
					Prompt
				</label>
				<input
					className="mt-2 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-slate-700 text-sm"
					id="prompt"
					readOnly
					type="text"
					value={DEFAULT_PROMPT}
				/>

				<button
					className="mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-slate-900 px-4 font-medium text-sm text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
					disabled={state === "streaming"}
					onClick={startStream}
					type="button"
				>
					{state === "streaming" ? "Streaming..." : "Start Stream"}
				</button>

				{error ? <p className="mt-3 text-rose-600 text-sm">{error}</p> : null}
			</div>

			<div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
				<p className="font-medium text-slate-700 text-sm">Stream output</p>
				<pre className="mt-3 min-h-48 overflow-auto rounded-lg bg-slate-950 p-4 font-mono text-slate-100 text-sm">
					{output || "No output yet."}
				</pre>
			</div>
		</div>
	);
}
