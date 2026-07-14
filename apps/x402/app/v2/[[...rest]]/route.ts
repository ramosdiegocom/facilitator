/**
 * x402 API v2
 *
 * Route: /v2/*
 *
 * Public API for payment verification and settlement
 * Requires: API key authentication
 */

import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { NextRequest } from "next/server";
import { API_POLICY } from "@/app/api/policy";
import { createPublicContext } from "@/app/api/routers/procedures";
import { publicRouter } from "@/app/api/routers/v2";

/**
 * Create unified router for public API
 */
const appRouter = publicRouter;

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
	headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
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

function applySupportedDiscoveryCacheHeaders(response: Response): Response {
	const policy = API_POLICY.v2.supported;
	const headers = new Headers(response.headers);

	if (policy.cacheControl) {
		headers.set("Cache-Control", policy.cacheControl);
	}

	if (policy.vary) {
		headers.set("Vary", policy.vary);
	}

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

async function normalizeSupportedDiscoveryResponse(
	response: Response
): Promise<Response> {
	try {
		const body = (await response.clone().json()) as {
			result?: unknown;
			json?: unknown;
		};

		let normalizedBody: unknown = body;

		if (typeof normalizedBody === "object" && normalizedBody !== null) {
			if (Object.hasOwn(normalizedBody, "result")) {
				normalizedBody = (normalizedBody as { result?: unknown }).result;
			}

			if (
				typeof normalizedBody === "object" &&
				normalizedBody !== null &&
				Object.hasOwn(normalizedBody, "json")
			) {
				normalizedBody = (normalizedBody as { json?: unknown }).json;
			}
		}

		if (normalizedBody !== body) {
			const headers = new Headers(response.headers);
			headers.delete("content-length");

			return Response.json(normalizedBody, {
				status: response.status,
				statusText: response.statusText,
				headers,
			});
		}
	} catch {
		// Leave non-JSON responses unchanged.
	}

	return response;
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

/**
 * RPC Handler: Processes requests to /v2/[procedure]
 */
const rpcHandler = new RPCHandler(appRouter, {
	interceptors: [
		onError((error) => {
			console.error("[Public API] RPC Error:");
			console.dir(error, { depth: null });
		}),
	],
});

/**
 * OpenAPI Handler: Generates schema at /v2/openapi.json
 */
const apiHandler = new OpenAPIHandler(appRouter, {
	plugins: [
		new OpenAPIReferencePlugin({
			schemaConverters: [new ZodToJsonSchemaConverter()],
			specPath: "/openapi.json",
		}),
	],
	interceptors: [
		onError((error) => {
			console.error("[Public API] OpenAPI Error:");
			console.dir(error, { depth: null });
		}),
	],
});

/**
 * Main handler for all public API requests
 */
async function handleRequest(req: NextRequest) {
	try {
		if (req.method === "OPTIONS") {
			return createCorsPreflightResponse(req);
		}

		const normalizedReq = await normalizeRpcJsonEnvelope(req);

		const context = await createPublicContext(normalizedReq);

		// Handle RPC procedure calls
		const rpcResult = await rpcHandler.handle(normalizedReq, {
			prefix: "/v2",
			context,
		});
		if (rpcResult.response) {
			const isSupportedDiscoveryGet =
				normalizedReq.method === "GET" &&
				normalizedReq.nextUrl.pathname === "/v2/supported";
			const normalizedResponse = await normalizeSupportedDiscoveryResponse(
				rpcResult.response
			);

			if (isSupportedDiscoveryGet) {
				return withCorsHeaders(
					applySupportedDiscoveryCacheHeaders(normalizedResponse),
					normalizedReq
				);
			}

			return withCorsHeaders(normalizedResponse, normalizedReq);
		}

		// Serve OpenAPI schema/docs routes
		const apiResult = await apiHandler.handle(normalizedReq, {
			prefix: "/v2",
			context,
		});
		if (apiResult.response) {
			return withCorsHeaders(apiResult.response, normalizedReq);
		}

		return withCorsHeaders(
			new Response(
				JSON.stringify({
					error: {
						code: "NOT_FOUND",
						message: "Endpoint not found",
					},
				}),
				{ status: 404, headers: { "Content-Type": "application/json" } }
			),
			normalizedReq
		);
	} catch (error) {
		console.error("[Public API] Unhandled Error:");
		console.dir(error, { depth: null });
		return withCorsHeaders(
			new Response(
				JSON.stringify({
					error: {
						code: "INTERNAL_SERVER_ERROR",
						message: "Internal server error",
					},
				}),
				{ status: 500, headers: { "Content-Type": "application/json" } }
			),
			req
		);
	}
}

export const GET = handleRequest;
export const POST = handleRequest;
export const OPTIONS = handleRequest;
