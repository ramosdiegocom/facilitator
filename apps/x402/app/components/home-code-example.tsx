import { codeToTokens } from "shiki";

const codeExample = `import { NextRequest, NextResponse } from "next/server";

const FACILITATOR = "https://x402.ramosdiego.com/v2";
const FACILITATOR_API_KEY = process.env.X402_FACILITATOR_API_KEY;

export async function GET(req: NextRequest) {
	if (!FACILITATOR_API_KEY) {
		throw new Error("Missing X402_FACILITATOR_API_KEY");
	}

	const encodedPayment = req.headers.get("PAYMENT-SIGNATURE");

	if (!encodedPayment) {
		return NextResponse.json({ error: "Payment required" }, { status: 402 });
	}

	const paymentPayload = JSON.parse(atob(encodedPayment));
	const paymentRequirements = {
		scheme: "exact",
		network: "eip155:84532",
		asset: "0x0000000000000000000000000000000000000000",
		amount: "1000000",
		payTo: "0xYourReceivingAddress",
		maxTimeoutSeconds: 60,
		extra: {},
	};

	const facilitatorBody = {
		x402Version: paymentPayload.x402Version,
		paymentPayload,
		paymentRequirements,
	};

	const verify = await fetch(\`\${FACILITATOR}/verify\`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: \`Bearer \${FACILITATOR_API_KEY}\`,
		},
		body: JSON.stringify(facilitatorBody),
	});

	if (!verify.ok) {
		return NextResponse.json({ error: "Invalid payment" }, { status: 402 });
	}

	const settle = await fetch(\`\${FACILITATOR}/settle\`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: \`Bearer \${FACILITATOR_API_KEY}\`,
		},
		body: JSON.stringify(facilitatorBody),
	});

	if (!settle.ok) {
		return NextResponse.json({ error: "Unable to settle payment" }, { status: 402 });
	}

	return NextResponse.json({ data: "protected response" });
}`;

export default async function HomeCodeExample() {
	const highlightedCode = await codeToTokens(codeExample, {
		lang: "ts",
		theme: "github-dark",
	});

	let runningLinePosition = 0;

	return (
		<pre
			className="mt-4 overflow-x-auto rounded-xl border border-slate-200 px-5 py-4 text-[12px] leading-5 sm:px-6 sm:text-sm"
			style={{
				backgroundColor: highlightedCode.bg,
				color: highlightedCode.fg,
			}}
		>
			<code>
				{highlightedCode.tokens.map((line) => {
					const lineStart = runningLinePosition;
					const lineLength = line.reduce(
						(total, token) => total + token.content.length,
						0
					);
					runningLinePosition += lineLength + 1;

					return (
						<span className="block" key={`line-${lineStart}`}>
							{line.length === 0
								? "\n"
								: line.map((token) => (
										<span
											key={`line-${lineStart}-token-${token.offset}`}
											style={{
												color: token.color,
											}}
										>
											{token.content}
										</span>
									))}
						</span>
					);
				})}
			</code>
		</pre>
	);
}
