import { NextResponse } from "next/server";

const MOCK_ASSET = "0x3600000000000000000000000000000000000000";
const MOCK_PAY_TO = "0xD844ba11F64d23a7481E24474D2f184e350B9B3d";
const DEFAULT_NETWORK = "eip155:5042002";
const EIP155_NETWORK_REGEX = /^eip155:\d+$/;
const INTEGER_REGEX = /^\d+$/;

type MockPaymentRequirements = {
	scheme: "exact";
	network: `eip155:${number}`;
	asset: `0x${string}`;
	amount: string;
	payTo: `0x${string}`;
	maxTimeoutSeconds: number;
};

type MockChallengeBody = {
	x402Version: "2";
	paymentRequirements: MockPaymentRequirements;
};

type MockPaidBody = {
	ok: true;
	source: "mock-402-simulator";
	data: {
		city: string;
		temperatureC: number;
		condition: string;
	};
};

function toNetwork(value: string | null): `eip155:${number}` {
	if (!value) {
		return DEFAULT_NETWORK;
	}

	if (EIP155_NETWORK_REGEX.test(value)) {
		return value as `eip155:${number}`;
	}

	if (INTEGER_REGEX.test(value)) {
		const numericChainId = Number.parseInt(value, 10);
		return `eip155:${numericChainId}`;
	}

	return DEFAULT_NETWORK;
}

function getPaymentProof(request: Request): string | null {
	const value = request.headers.get("PAYMENT-SIGNATURE");

	if (value) {
		return value;
	}

	return null;
}

function buildMockChallenge(network: `eip155:${number}`) {
	// return as b64 encoded string
	const challenge: MockChallengeBody = {
		x402Version: "2",
		paymentRequirements: {
			scheme: "exact",
			network,
			asset: MOCK_ASSET,
			amount: "1000000",
			payTo: MOCK_PAY_TO,
			maxTimeoutSeconds: 60,
		},
	};

	const challengeb64 = btoa(JSON.stringify(challenge));

	return challengeb64;
}

function buildMockPaidResponse() {
	const data: MockPaidBody = {
		ok: true,
		source: "mock-402-simulator",
		data: {
			city: "San Francisco",
			temperatureC: 17,
			condition: "Foggy",
		},
	};

	return btoa(JSON.stringify(data));
}

export function GET(request: Request) {
	const network = toNetwork(request.headers.get("x-chain-id"));
	const paymentProof = getPaymentProof(request);

	if (!paymentProof) {
		return new NextResponse(null, {
			status: 402,
			headers: {
				"payment-required": buildMockChallenge(network),
				"cache-control": "no-store",
			},
		});
	}

	return new NextResponse(null, {
		status: 200,
		headers: {
			"payment-response": buildMockPaidResponse(),
			"cache-control": "no-store",
		},
	});
}
