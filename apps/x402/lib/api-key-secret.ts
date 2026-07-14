import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const API_KEY_PREFIX = "x402_";
const SECRET_BYTES = 32;

export function generateApiKeySecret() {
	return `${API_KEY_PREFIX}${randomBytes(SECRET_BYTES).toString("hex")}`;
}

export function hashApiKeySecret(secret: string) {
	return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function keyHashMatches(secret: string, expectedHash: string) {
	const computedBuffer = Buffer.from(hashApiKeySecret(secret), "utf8");
	const expectedBuffer = Buffer.from(expectedHash, "utf8");

	if (computedBuffer.length !== expectedBuffer.length) {
		return false;
	}

	return timingSafeEqual(computedBuffer, expectedBuffer);
}

export function getApiKeyPrefix(secret: string) {
	return secret.slice(0, Math.min(secret.length, 18));
}
