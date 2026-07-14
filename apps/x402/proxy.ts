import { auth } from "@ramoz/auth";
import { paymentProxy } from "@x402/next";
import { createPaywall, evmPaywall } from "@x402/paywall";
import { type NextRequest, NextResponse } from "next/server";
import { x402Server } from "@/app/api/facilitator";
import type { SupportedChainCAIP2 } from "@/app/api/routers/chains";
import { isPaymentProxyPath, isPublicAppPath } from "@/lib/auth-policy";
import { ARC_TESTNET_FAUCET_ADDRESS } from "@/lib/constants";

// Build paywall
export const paywall = createPaywall()
	.withNetwork(evmPaywall)
	.withConfig({
		appName: "Next x402 Demo",
		appLogo: "/x402-icon-blue.png",
		testnet: true,
	})
	.build();

export async function proxy(request: NextRequest) {
	const { pathname } = request.nextUrl;

	if (isPaymentProxyPath(pathname)) {
		const payment = paymentProxy(
			{
				"/playground/protected": {
					accepts: [
						{
							scheme: "exact",
							price: "$0.001",
							network: "eip155:5042002" as SupportedChainCAIP2,
							payTo: ARC_TESTNET_FAUCET_ADDRESS,
						},
					],
					description: "Premium music: x402 Remix",
					mimeType: "text/html",
				},
			},
			x402Server,
			undefined, // paywallConfig (using custom paywall instead)
			paywall // custom paywall provider
		);

		return payment(request);
	}

	const isPublic = isPublicAppPath(pathname);

	if (isPublic) {
		return NextResponse.next();
	}

	const session = await auth.api.getSession({
		headers: request.headers,
	});

	if (!session) {
		const loginUrl = new URL("/login", request.url);
		return NextResponse.redirect(loginUrl);
	}

	return NextResponse.next();
}

export const config = {
	matcher: [
		"/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|webmanifest)$).*)",
	],
};
