"use client";

import { env } from "@ramoz/env/finance";
import { tempo } from "mppx/client";
import { useState } from "react";
import { createClient, http } from "viem";
import { type Address, privateKeyToAccount } from "viem/accounts";
import { Chain } from "viem/tempo";
import { fluxConfig } from "@/app/flux/_server/config";

const meteredStreamUrl = "/flux/stream-text";

function createSession() {
	const account = privateKeyToAccount(env.PRIVATE_KEY as Address);
	const client = createClient({
		account,
		chain: Chain.testnet,
		pollingInterval: 1000,
		transport: http(),
	});

	return {
		session: tempo.session({
			account,
			client,
			maxDeposit: fluxConfig.maxDeposit,
		}),
	};
}

async function streamMeteredText(
	onChunk: (chunk: string) => void
): Promise<void> {
	const { session } = createSession();

	try {
		const chunks = await session.sse(meteredStreamUrl);

		for await (const chunk of chunks) {
			onChunk(chunk);
		}
	} finally {
		const closeReceipt = await session.close().catch(() => undefined);
		console.log("Metered stream session closed", { closeReceipt });
	}
}

export function PaidSessionStreamDemo() {
	const [meteredTextStream, setMeteredTextStream] = useState("");
	const [isMeteredStreaming, setIsMeteredStreaming] = useState(false);

	const handleMeteredStream = async () => {
		setMeteredTextStream("");
		setIsMeteredStreaming(true);

		try {
			await streamMeteredText((chunk) => {
				setMeteredTextStream((current) => current + chunk);
				console.log("Received metered chunk:", chunk);
			});
		} catch (error) {
			console.error("Metered stream error", error);
		} finally {
			setIsMeteredStreaming(false);
		}
	};

	return (
		<section className="space-y-3 rounded border border-zinc-200 p-4">
			<h2 className="font-semibold text-lg">
				Metered /flux/stream-text endpoint
			</h2>
			<button
				className="rounded bg-blue-500 px-4 py-2 text-white"
				disabled={isMeteredStreaming}
				onClick={handleMeteredStream}
				type="button"
			>
				{isMeteredStreaming
					? "Streaming Metered Text..."
					: "Run Metered Stream Demo"}
			</button>
			<pre className="rounded border border-zinc-300 bg-zinc-50 p-4 text-sm">
				{meteredTextStream || "No metered text streamed yet."}
			</pre>
		</section>
	);
}
