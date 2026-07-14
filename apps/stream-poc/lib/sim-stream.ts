const BASE_SCRIPT = [
	"Opening bumper rolling.",
	"Camera feed stabilized.",
	"Streamer introduces the session topic.",
	"Audience poll appears on screen.",
	"Quick demo segment begins.",
	"Live chart overlay updates.",
	"Q&A answer highlighted.",
	"Closing countdown starts.",
] as const;

export function createSimulatedChunk(tick: number, streamerLabel: string): string {
	const index = (tick - 1) % BASE_SCRIPT.length;
	const line = BASE_SCRIPT[index] ?? BASE_SCRIPT[0];
	return `Tick ${tick.toString().padStart(2, "0")} | ${streamerLabel}: ${line}`;
}
