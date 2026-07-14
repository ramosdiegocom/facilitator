"use client";

import { SignInForm } from "@ramoz/ui/components/auth/sign-in-form";

export function Login() {
	return (
		<div className="mx-auto max-w-sm">
			<div>Log In</div>
			<SignInForm />
		</div>
	);
}
