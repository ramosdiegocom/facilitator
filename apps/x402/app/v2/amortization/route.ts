/**
 * x402 amortization endpoint
 *
 * Route: /v2/amortization
 */

import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { withX402 } from "@x402/next";
import { NextRequest, NextResponse } from "next/server";
import { x402Server } from "@/app/api/facilitator";
import type { SupportedChainCAIP2 } from "@/app/api/routers/chains";
import { createPublicContext } from "@/app/api/routers/procedures";
import { amortizationRouter } from "@/app/api/routers/v2-amortization";
import { ARC_TESTNET_FAUCET_ADDRESS } from "@/lib/constants";

const DEFAULT_ALLOWED_HEADERS = "Authorization, Content-Type";

function appendVary(headers: Headers, value: string): void {
	const currentValue = headers.get("Vary");

	if (!currentValue) {
		headers.set("Vary", value);
		return;
	}

	const values = new Set(currentValue.split(",").map((item) => item.trim()));
	values.add(value);
	headers.set("Vary", Array.from(values).join(", "));
}

function withCorsHeaders(response: Response, req: NextRequest): Response {
	const headers = new Headers(response.headers);
	const requestedHeaders = req.headers.get("access-control-request-headers");

	headers.set("Access-Control-Allow-Origin", "*");
	headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
	headers.set(
		"Access-Control-Allow-Headers",
		requestedHeaders?.trim() || DEFAULT_ALLOWED_HEADERS
	);
	headers.set("Access-Control-Max-Age", "86400");
	appendVary(headers, "Access-Control-Request-Headers");

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

function createCorsPreflightResponse(req: NextRequest): Response {
	return withCorsHeaders(new Response(null, { status: 204 }), req);
}

async function normalizeRpcJsonEnvelope(
	req: NextRequest
): Promise<NextRequest> {
	const isJsonPost =
		req.method === "POST" &&
		req.headers.get("content-type")?.includes("application/json");

	if (!isJsonPost) {
		return req;
	}

	const rawBody = await req.text();

	if (rawBody.trim().length === 0) {
		return req;
	}

	try {
		const parsedBody = JSON.parse(rawBody) as unknown;
		const isWrapped =
			typeof parsedBody === "object" &&
			parsedBody !== null &&
			"json" in parsedBody;

		const normalizedBody = isWrapped
			? rawBody
			: JSON.stringify({ json: parsedBody });

		const headers = new Headers(req.headers);
		headers.delete("content-length");

		return new NextRequest(req.url, {
			method: req.method,
			headers,
			body: normalizedBody,
		});
	} catch {
		return new NextRequest(req.url, {
			method: req.method,
			headers: req.headers,
			body: rawBody,
		});
	}
}

const rpcHandler = new RPCHandler(amortizationRouter, {
	interceptors: [
		onError((error) => {
			console.error("[Amortization API] RPC Error:");
			console.dir(error, { depth: null });
		}),
	],
});

const paidAmortizationHandler = withX402(
	async (request: NextRequest) => {
		const normalizedReq = await normalizeRpcJsonEnvelope(request);
		const context = await createPublicContext(normalizedReq);
		const rpcResult = await rpcHandler.handle(normalizedReq, {
			prefix: "/v2",
			context,
		});

		if (rpcResult.response) {
			return new NextResponse(rpcResult.response.body, {
				status: rpcResult.response.status,
				statusText: rpcResult.response.statusText,
				headers: rpcResult.response.headers,
			});
		}

		return NextResponse.json(
			{
				error: {
					code: "NOT_FOUND",
					message: "Endpoint not found",
				},
			},
			{ status: 404 }
		);
	},
	{
		accepts: [
			{
				scheme: "exact",
				price: "$0.001",
				network: "eip155:5042002" as SupportedChainCAIP2,
				payTo: ARC_TESTNET_FAUCET_ADDRESS,
			},
		],
		description: "Mortgage amortization schedule",
		mimeType: "application/json",
	},
	x402Server
);

async function handleRequest(req: NextRequest): Promise<Response> {
	try {
		if (req.method === "OPTIONS") {
			return createCorsPreflightResponse(req);
		}

		if (req.method !== "POST") {
			return withCorsHeaders(
				Response.json(
					{
						error: {
							code: "METHOD_NOT_ALLOWED",
							message: "Method not allowed",
						},
					},
					{
						status: 405,
						headers: { Allow: "POST, OPTIONS" },
					}
				),
				req
			);
		}

		const paidResponse = await paidAmortizationHandler(req);
		return withCorsHeaders(paidResponse, req);
	} catch (error) {
		console.error("[Amortization API] Unhandled Error:");
		console.dir(error, { depth: null });

		return withCorsHeaders(
			Response.json(
				{
					error: {
						code: "INTERNAL_SERVER_ERROR",
						message: "Internal server error",
					},
				},
				{ status: 500 }
			),
			req
		);
	}
}

export const POST = handleRequest;
export const OPTIONS = handleRequest;
export const GET = handleRequest;
