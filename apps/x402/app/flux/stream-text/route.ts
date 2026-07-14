import { fluxSessionHandler } from "@/app/flux/_server/mppx";

export const dynamic = "force-dynamic";

const hardcodedText =
	"This response is streamed from /flux/stream-text and each chunk is charged.";

function wait(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

async function* generateChargedChunks(text: string): AsyncGenerator<string> {
	const words = text.split(" ");

	for (let index = 0; index < words.length; index += 1) {
		const prefix = index === 0 ? "" : " ";
		yield `${prefix}${words[index]}`;
		await wait(120);
	}
}

async function handleSessionRequest(request: Request): Promise<Response> {
	try {
		const result = await fluxSessionHandler(request);

		if (result.status === 402) {
			return result.challenge;
		}

		return result.withReceipt(async function* (stream) {
			for await (const chunk of generateChargedChunks(hardcodedText)) {
				try {
					await stream.charge();
				} catch {
					break;
				}

				yield chunk;
			}
		});
	} catch (error) {
		console.error("[flux/stream-text] streaming failure", error);
		return Response.json(
			{
				error: "Flux stream-text failed",
				detail:
					error instanceof Error ? error.message : "Unknown stream-text error",
			},
			{ status: 500 }
		);
	}
}

export const GET = handleSessionRequest;
export const POST = handleSessionRequest;
