export const dynamic = "force-dynamic";

const hardcodedText =
	"This response is streamed from /stream-text with no auth and no payments.";

function wait(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

function createTextStream(text: string): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	const words = text.split(" ");

	return new ReadableStream<Uint8Array>({
		async start(controller) {
			for (let index = 0; index < words.length; index += 1) {
				const prefix = index === 0 ? "" : " ";
				controller.enqueue(encoder.encode(`${prefix}${words[index]}`));
				await wait(120);
			}

			controller.close();
		},
	});
}

export function GET(): Response {
	const stream = createTextStream(hardcodedText);

	return new Response(stream, {
		headers: {
			"Cache-Control": "no-store",
			"Content-Type": "text/plain; charset=utf-8",
		},
	});
}
