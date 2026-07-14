"use client";

import { useState } from "react";

const streamTextUrl = "/stream-text";

async function streamText(onChunk: (chunk: string) => void): Promise<void> {
	const response = await fetch(streamTextUrl, {
		cache: "no-store",
		method: "GET",
	});

	if (response.ok === false) {
		throw new Error(`Request failed with status ${response.status}`);
	}

	if (response.body == null) {
		throw new Error("Response body is not streamable");
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();

	while (true) {
		const { done, value } = await reader.read();

		if (done) {
			break;
		}

		onChunk(decoder.decode(value, { stream: true }));
	}

	const finalChunk = decoder.decode();

	if (finalChunk.length > 0) {
		onChunk(finalChunk);
	}
}

export function PlainTextStreamDemo() {
	const [plainTextStream, setPlainTextStream] = useState("");
	const [isPlainTextStreaming, setIsPlainTextStreaming] = useState(false);

	const handleStreamText = async () => {
		setPlainTextStream("");
		setIsPlainTextStreaming(true);

		try {
			await streamText((chunk) => {
				setPlainTextStream((current) => current + chunk);
				console.log("Received plain text chunk:", chunk);
			});
		} catch (error) {
			console.error("Plain text stream error", error);
		} finally {
			setIsPlainTextStreaming(false);
		}
	};

	return (
		<section className="space-y-3 rounded border border-zinc-200 p-4">
			<h2 className="font-semibold text-lg">Plain /stream-text endpoint</h2>
			<button
				className="rounded bg-emerald-600 px-4 py-2 text-white"
				disabled={isPlainTextStreaming}
				onClick={handleStreamText}
				type="button"
			>
				{isPlainTextStreaming ? "Streaming Text..." : "Run Text Stream Demo"}
			</button>
			<pre className="rounded border border-zinc-300 bg-zinc-50 p-4 text-sm">
				{plainTextStream || "No text streamed yet."}
			</pre>
		</section>
	);
}
