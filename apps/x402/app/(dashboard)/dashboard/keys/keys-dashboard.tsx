"use client";

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
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@ramoz/ui/components/dialog";
import { Input } from "@ramoz/ui/components/input";
import { useEffect, useMemo, useRef, useState } from "react";
import { API_KEY_ACTIVE_LIMIT, apiKeyNameSchema } from "@/lib/api-keys";
import { adminOrpc } from "@/utils/orpc-admin";

type DashboardKey = Awaited<ReturnType<typeof adminOrpc.listApiKeys>>[number];
type Provisioned = Awaited<ReturnType<typeof adminOrpc.ensureProvisioned>>;
type CreatedApiKey = Awaited<ReturnType<typeof adminOrpc.createApiKey>>;

function toErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message.trim().length > 0) {
		return error.message;
	}

	return "Request failed. Please try again.";
}

export function KeysDashboard() {
	const [provisioned, setProvisioned] = useState<Provisioned | null>(null);
	const [keys, setKeys] = useState<DashboardKey[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [isCreating, setIsCreating] = useState(false);
	const [isRevokingId, setIsRevokingId] = useState<string | null>(null);
	const [pendingRevokeKey, setPendingRevokeKey] = useState<DashboardKey | null>(
		null
	);
	const [name, setName] = useState("");
	const [nameError, setNameError] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [capError, setCapError] = useState<string | null>(null);
	const [createdKey, setCreatedKey] = useState<CreatedApiKey | null>(null);
	const [isSecretDialogOpen, setIsSecretDialogOpen] = useState(false);
	const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
	const secretInputRef = useRef<HTMLInputElement | null>(null);

	const activeKeys = useMemo(
		() => keys.filter((key) => key.status === "active").length,
		[keys]
	);

	async function reloadKeys(resourceServerId: string) {
		const listedKeys = await adminOrpc.listApiKeys({ resourceServerId });
		setKeys(listedKeys);
	}

	async function loadKeysFlow() {
		setIsLoading(true);
		setError(null);
		setCapError(null);

		try {
			const provisionedResult = await adminOrpc.ensureProvisioned();
			setProvisioned(provisionedResult);
			await reloadKeys(provisionedResult.resourceServerId);
		} catch (loadError) {
			setError(toErrorMessage(loadError));
		} finally {
			setIsLoading(false);
		}
	}

	useEffect(() => {
		const run = async () => {
			await loadKeysFlow();
		};

		run();
	}, []);

	async function onCreateKey() {
		setNameError(null);
		setError(null);
		setCapError(null);

		const parsedName = apiKeyNameSchema.safeParse(name);
		if (!parsedName.success) {
			const issue = parsedName.error.issues[0];
			setNameError(issue?.message ?? "Invalid key name");
			return;
		}

		if (!provisioned) {
			setError("Provisioning must complete before creating keys.");
			return;
		}

		setIsCreating(true);
		try {
			const created = await adminOrpc.createApiKey({
				name: parsedName.data,
				resourceServerId: provisioned.resourceServerId,
			});

			setCreatedKey(created);
			setIsSecretDialogOpen(true);
			setName("");
			await reloadKeys(provisioned.resourceServerId);
		} catch (createError) {
			const message = toErrorMessage(createError);
			if (message.includes("KEY_LIMIT_REACHED")) {
				setCapError(
					`Active key limit reached (${API_KEY_ACTIVE_LIMIT}). Revoke one key before creating another.`
				);
				return;
			}
			setError(message);
		} finally {
			setIsCreating(false);
		}
	}

	async function onRevokeKey(keyId: string) {
		if (!provisioned) {
			return;
		}

		setError(null);
		setIsRevokingId(keyId);
		try {
			await adminOrpc.revokeApiKey({ keyId });
			await reloadKeys(provisioned.resourceServerId);
		} catch (revokeError) {
			setError(toErrorMessage(revokeError));
		} finally {
			setIsRevokingId(null);
		}
	}

	function selectEntireSecret() {
		const input = secretInputRef.current;

		if (!input) {
			return;
		}

		input.focus();
		input.setSelectionRange(0, input.value.length);
	}

	async function copySecretToClipboard() {
		if (!createdKey?.secret) {
			return;
		}

		try {
			await navigator.clipboard.writeText(createdKey.secret);
			setCopyFeedback("Copied");
		} catch {
			setCopyFeedback("Copy failed");
		}
	}

	return (
		<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 sm:px-6">
			<Card>
				<CardHeader>
					<CardTitle>Generate API Key</CardTitle>
					<CardDescription>
						Create keys for /v2/verify and /v2/settle.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{error ? <Alert variant="destructive">{error}</Alert> : null}
					{capError ? <Alert variant="destructive">{capError}</Alert> : null}
					<div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
						<Input
							disabled={isLoading || !provisioned || isCreating}
							maxLength={25}
							onChange={(event) => {
								setName(event.target.value);
								if (nameError) {
									setNameError(null);
								}
							}}
							placeholder="Key name"
							value={name}
						/>
						<Button
							disabled={isLoading || !provisioned || isCreating}
							onClick={async () => {
								await onCreateKey();
							}}
							type="button"
						>
							{isCreating ? "Creating..." : "Create Key"}
						</Button>
					</div>
					{nameError && <p className="text-destructive text-sm">{nameError}</p>}
					<p className="text-muted-foreground text-xs">
						Active keys: {activeKeys}/{API_KEY_ACTIVE_LIMIT}
					</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>API Keys</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="overflow-x-auto">
						<table className="w-full border-collapse text-left text-sm">
							<thead>
								<tr className="border-border border-b">
									<th className="py-2 pr-4">Name</th>
									<th className="py-2 pr-4">Prefix</th>
									<th className="py-2 pr-4">Created</th>
									<th className="py-2 pr-4">Last Used</th>
									<th className="py-2 pr-4">Status</th>
									<th className="py-2">Action</th>
								</tr>
							</thead>
							<tbody>
								{keys.length === 0 ? (
									<tr>
										<td className="py-4 text-muted-foreground" colSpan={6}>
											No API keys yet.
										</td>
									</tr>
								) : null}
								{keys.map((key) => (
									<tr className="border-border/60 border-b" key={key.id}>
										<td className="py-3 pr-4">{key.name}</td>
										<td className="py-3 pr-4">{key.prefix}</td>
										<td className="py-3 pr-4">
											{new Date(key.createdAt).toLocaleString()}
										</td>
										<td className="py-3 pr-4">
											{key.lastUsedAt
												? new Date(key.lastUsedAt).toLocaleString()
												: "Never"}
										</td>
										<td className="py-3 pr-4">
											{key.status === "revoked" ? "Revoked" : "Active"}
										</td>
										<td className="py-3">
											<Button
												disabled={
													key.status === "revoked" || isRevokingId === key.id
												}
												onClick={() => {
													setPendingRevokeKey(key);
												}}
												size="sm"
												variant="outline"
											>
												{isRevokingId === key.id ? "Revoking..." : "Revoke"}
											</Button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</CardContent>
			</Card>

			<AlertDialog
				onOpenChange={(open) => {
					if (!open) {
						setPendingRevokeKey(null);
					}
				}}
				open={pendingRevokeKey !== null}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Revoke API key?</AlertDialogTitle>
						<AlertDialogDescription>
							This key will stop working immediately for /v2/verify and
							/v2/settle.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel type="button">Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={async () => {
								if (!pendingRevokeKey) {
									return;
								}

								await onRevokeKey(pendingRevokeKey.id);
								setPendingRevokeKey(null);
							}}
							type="button"
						>
							Confirm revoke
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<Dialog
				onOpenChange={(nextOpen) => {
					setIsSecretDialogOpen(nextOpen);
					if (!nextOpen) {
						setCreatedKey(null);
						setCopyFeedback(null);
					}
				}}
				open={isSecretDialogOpen}
			>
				<DialogContent showCloseButton={false}>
					<DialogHeader>
						<DialogTitle>Save your API key now</DialogTitle>
						<DialogDescription>
							This secret is shown once and cannot be retrieved again.
						</DialogDescription>
					</DialogHeader>
					<div>
						<p className="mb-2 text-muted-foreground text-xs">Secret</p>
						<input
							className="w-full rounded border border-border bg-background px-2 py-2 font-mono text-xs"
							onClick={selectEntireSecret}
							onDoubleClick={selectEntireSecret}
							readOnly
							ref={secretInputRef}
							value={createdKey?.secret ?? ""}
						/>
					</div>
					<DialogFooter>
						<Button
							onClick={async () => {
								await copySecretToClipboard();
							}}
							type="button"
							variant="outline"
						>
							{copyFeedback ?? "Copy key"}
						</Button>
						<Button
							onClick={() => {
								setIsSecretDialogOpen(false);
								setCreatedKey(null);
								setCopyFeedback(null);
							}}
							type="button"
						>
							I saved my key
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
