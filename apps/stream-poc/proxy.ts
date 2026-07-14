import { auth } from "@ramoz/auth";
import { type NextRequest, NextResponse } from "next/server";
import { isPublicAppPath } from "@/lib/auth-policy";

export async function proxy(request: NextRequest) {
	const { pathname } = request.nextUrl;

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
