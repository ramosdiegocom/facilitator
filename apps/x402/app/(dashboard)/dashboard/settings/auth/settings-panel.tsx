"use client";

import { authClient } from "@ramoz/auth/auth-client";
import { Alert } from "@ramoz/ui/components/alert";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@ramoz/ui/components/alert-dialog";
import { Button } from "@ramoz/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@ramoz/ui/components/card";
import { Input } from "@ramoz/ui/components/input";
import { Fingerprint, KeyRound, Shield } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { adminOrpc } from "@/utils/orpc-admin";

type AuthSettingsData = Awaited<
	ReturnType<typeof adminOrpc.authSettings.getAuthSettings>
>;

type AuthSettingsPanelProps = {
	initialData: AuthSettingsData;
};

async function detectPasskeySupport() {
	if (typeof window === "undefined") {
		return false;
	}

	if ("PublicKeyCredential" in window === false) {
		return false;
	}

	const publicKeyCredential = window.PublicKeyCredential as {
		isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean>;
	};

	if (
		typeof publicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !==
		"function"
	) {
		return true;
	}

	try {
		return await publicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
	} catch {
		return false;
	}
}

export function AuthSettingsPanel({ initialData }: AuthSettingsPanelProps) {
	const router = useRouter();
	const [currentUserEmail, setCurrentUserEmail] = useState(
		initialData.currentUserEmail
	);
	const [passkeys, setPasskeys] = useState(initialData.passkeys);
	const [otherSessionsCount, setOtherSessionsCount] = useState(
		initialData.otherSessionsCount
	);
	const [pendingDeletePasskeyId, setPendingDeletePasskeyId] = useState<
		string | null
	>(null);
	const [isCreatingPasskey, setIsCreatingPasskey] = useState(false);
	const [isDeletingPasskey, setIsDeletingPasskey] = useState(false);
	const [isChangingPassword, setIsChangingPassword] = useState(false);
	const [isRevokingSessions, setIsRevokingSessions] = useState(false);
	const [isPasskeySupported, setIsPasskeySupported] = useState<boolean | null>(
		null
	);
	const [statusMessage, setStatusMessage] = useState<string | null>(null);
	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");

	const canCreatePasskey =
		isPasskeySupported === true && isCreatingPasskey === false;

	async function reloadSettings() {
		const refreshed = await adminOrpc.authSettings.getAuthSettings();
		setCurrentUserEmail(refreshed.currentUserEmail);
		setPasskeys(refreshed.passkeys);
		setOtherSessionsCount(refreshed.otherSessionsCount);
	}

	useEffect(() => {
		let isMounted = true;

		const run = async () => {
			const supported = await detectPasskeySupport();
			if (isMounted) {
				setIsPasskeySupported(supported);
			}
		};

		run();

		return () => {
			isMounted = false;
		};
	}, []);

	async function handleCreatePasskey() {
		if (canCreatePasskey === false) {
			return;
		}

		try {
			setIsCreatingPasskey(true);
			setStatusMessage(null);
			toast("Creating passkey...");

			const dateLabel = new Date().toLocaleDateString();
			const passkeyName = currentUserEmail
				? `${currentUserEmail} ${dateLabel}`
				: `Passkey ${dateLabel}`;

			const response = await authClient.passkey.addPasskey({
				name: passkeyName,
			});

			if (!response.data) {
				throw new Error("Passkey was not created");
			}

			await adminOrpc.authSettings.createPasskey({
				passkeyId: response.data.id,
				passkeyName: response.data.name ?? null,
			});

			await reloadSettings();
			router.refresh();
			toast.success("Passkey created.");
		} catch {
			toast.error("Failed to create passkey.");
		} finally {
			setIsCreatingPasskey(false);
		}
	}

	async function handleDeletePasskey(passkeyId: string) {
		try {
			setIsDeletingPasskey(true);
			setStatusMessage(null);
			const response = await adminOrpc.authSettings.deletePasskey({
				passkeyId,
			});
			setPasskeys(response.passkeys);
			setPendingDeletePasskeyId(null);
			toast.success("Passkey deleted.");
		} catch {
			toast.error("Failed to delete passkey.");
		} finally {
			setIsDeletingPasskey(false);
		}
	}

	async function handleChangePassword() {
		setStatusMessage(null);

		if (newPassword.length < 8) {
			toast.error("New password must be at least 8 characters.");
			return;
		}

		if (newPassword !== confirmPassword) {
			toast.error("Passwords do not match.");
			return;
		}

		try {
			setIsChangingPassword(true);
			const result = await adminOrpc.authSettings.changePassword({
				currentPassword,
				newPassword,
			});

			setCurrentPassword("");
			setNewPassword("");
			setConfirmPassword("");
			setStatusMessage(result.message);
			setOtherSessionsCount(0);
			toast.success("Password changed.");
			router.refresh();
		} catch {
			toast.error("Could not change password. Check your current password.");
		} finally {
			setIsChangingPassword(false);
		}
	}

	async function handleRevokeOtherSessions() {
		try {
			setIsRevokingSessions(true);
			setStatusMessage(null);
			const result = await adminOrpc.authSettings.revokeOtherSessions();
			setOtherSessionsCount(0);
			setStatusMessage(
				`${result.revokedSessionCount} other session(s) were signed out.`
			);
			toast.success("Other sessions signed out.");
			router.refresh();
		} catch {
			toast.error("Could not revoke sessions.");
		} finally {
			setIsRevokingSessions(false);
		}
	}

	return (
		<div className="space-y-6 py-6">
			<Card>
				<CardHeader>
					<CardTitle>Auth Settings</CardTitle>
					<CardDescription>
						Manage passkeys, password, and active sessions.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{statusMessage ? <Alert>{statusMessage}</Alert> : null}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Fingerprint className="h-4 w-4" />
						Passkeys
					</CardTitle>
					<CardDescription>
						Create or remove passkeys used for passwordless sign-in.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{passkeys.length === 0 ? (
						<div className="rounded-lg border border-dashed p-4">
							<p className="font-medium text-sm">No passkeys yet</p>
							<p className="mt-1 text-muted-foreground text-sm">
								Create a passkey to sign in faster and with stronger security.
							</p>
						</div>
					) : (
						<div className="space-y-2">
							{passkeys.map((passkey) => (
								<div
									className="flex items-center justify-between rounded-md border p-3"
									key={passkey.id}
								>
									<div>
										<p className="font-medium text-sm">
											{passkey.name || "Unnamed passkey"}
										</p>
										<p className="text-muted-foreground text-xs">
											Created {new Date(passkey.createdAt).toLocaleString()}
										</p>
									</div>
									<Button
										disabled={isDeletingPasskey}
										onClick={() => setPendingDeletePasskeyId(passkey.id)}
										size="sm"
										variant="outline"
									>
										Delete
									</Button>
								</div>
							))}
						</div>
					)}

					<Button
						disabled={canCreatePasskey === false}
						onClick={async () => {
							await handleCreatePasskey();
						}}
						type="button"
					>
						{isCreatingPasskey ? "Creating..." : "Create Passkey"}
					</Button>

					{isPasskeySupported === false ? (
						<p className="text-muted-foreground text-sm">
							Passkeys are not supported in this environment. Try a supported
							browser or device.
						</p>
					) : null}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<KeyRound className="h-4 w-4" />
						Change Password
					</CardTitle>
					<CardDescription>
						Changing your password signs out your other active sessions.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					<Input
						autoComplete="current-password"
						onChange={(event) => setCurrentPassword(event.target.value)}
						placeholder="Current password"
						type="password"
						value={currentPassword}
					/>
					<Input
						autoComplete="new-password"
						onChange={(event) => setNewPassword(event.target.value)}
						placeholder="New password"
						type="password"
						value={newPassword}
					/>
					<Input
						autoComplete="new-password"
						onChange={(event) => setConfirmPassword(event.target.value)}
						placeholder="Confirm new password"
						type="password"
						value={confirmPassword}
					/>
					<Button
						disabled={isChangingPassword}
						onClick={async () => {
							await handleChangePassword();
						}}
						type="button"
					>
						{isChangingPassword ? "Updating..." : "Update Password"}
					</Button>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Shield className="h-4 w-4" />
						Sessions
					</CardTitle>
					<CardDescription>
						You have {otherSessionsCount} other active session(s).
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Button
						disabled={isRevokingSessions || otherSessionsCount === 0}
						onClick={async () => {
							await handleRevokeOtherSessions();
						}}
						type="button"
						variant="outline"
					>
						{isRevokingSessions ? "Revoking..." : "Sign out other sessions"}
					</Button>
				</CardContent>
			</Card>

			<AlertDialog
				onOpenChange={(open) => {
					if (!open) {
						setPendingDeletePasskeyId(null);
					}
				}}
				open={pendingDeletePasskeyId !== null}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete this passkey?</AlertDialogTitle>
						<AlertDialogDescription>
							You can remove your last passkey. You will still be able to sign
							in with email and password.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel type="button">Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={async () => {
								if (!pendingDeletePasskeyId) {
									return;
								}

								await handleDeletePasskey(pendingDeletePasskeyId);
							}}
							type="button"
						>
							Confirm delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
