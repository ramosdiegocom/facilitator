const PUBLIC_EXACT_ROUTES = [
	"/",
	"/login",
	"/signup",
	"/forgot-password",
	"/reset-password",
	"/verify-email",
	"/weather",
	"/playground/weather",
	"/playground",
	"/ws",
] as const;

const PUBLIC_PREFIX_ROUTES = ["/v2", "/playground/protected"] as const;

const PUBLIC_METADATA_SUFFIXES = [
	"/manifest.webmanifest",
	"/opengraph-image",
] as const;

function matchesExactRoute(pathname: string): boolean {
	return PUBLIC_EXACT_ROUTES.includes(
		pathname as (typeof PUBLIC_EXACT_ROUTES)[number]
	);
}

function matchesPrefixRoute(pathname: string): boolean {
	return PUBLIC_PREFIX_ROUTES.some(
		(prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
	);
}

function matchesMetadataSuffix(pathname: string): boolean {
	return PUBLIC_METADATA_SUFFIXES.some((suffix) => pathname.endsWith(suffix));
}

export function isPublicAppPath(pathname: string): boolean {
	return (
		matchesExactRoute(pathname) ||
		matchesPrefixRoute(pathname) ||
		matchesMetadataSuffix(pathname)
	);
}

export function isPaymentProxyPath(pathname: string): boolean {
	return (
		pathname === "/playground/protected" ||
		pathname.startsWith("/playground/protected/")
	);
}
