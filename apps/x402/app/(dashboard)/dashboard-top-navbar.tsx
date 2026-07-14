"use client";

import { authClient } from "@ramoz/auth/auth-client";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@ramoz/ui/components/dropdown-menu";
import { WireframeNav } from "@ramoz/ui/components/wireframe";
import { ChevronDown, LogOut, Settings } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { APP_STATE_STORAGE_KEY_PREFIX } from "@/providers/app-state-provider";

export function DashboardTopNavbar({
	userEmail,
}: {
	userEmail?: string | null;
}) {
	const router = useRouter();
	const [isSigningOut, setIsSigningOut] = useState(false);

	const handleSignOut = async () => {
		setIsSigningOut(true);

		try {
			await authClient.signOut();

			for (const key of Object.keys(localStorage)) {
				if (key.startsWith(`${APP_STATE_STORAGE_KEY_PREFIX}:`)) {
					localStorage.removeItem(key);
				}
			}

			router.replace("/login");
			router.refresh();
		} finally {
			setIsSigningOut(false);
		}
	};

	return (
		<WireframeNav
			className="border-slate-200 border-b bg-background/70 backdrop-blur"
			hideOn="mobile"
			position="top"
		>
			<div className="flex h-full items-center justify-end px-4">
				<DropdownMenu>
					<DropdownMenuTrigger className="inline-flex h-8 items-center gap-2 rounded-4xl border border-slate-200 bg-background px-3 font-medium text-slate-700 text-sm transition hover:bg-slate-50">
						<span className="max-w-52 truncate">{userEmail ?? "Account"}</span>
						<ChevronDown className="h-4 w-4 text-slate-500" />
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-52">
						<DropdownMenuItem
							onClick={() => {
								router.push("/dashboard/settings/auth" as never);
							}}
						>
							<Settings className="h-4 w-4" />
							Settings
						</DropdownMenuItem>
						<DropdownMenuItem
							disabled={isSigningOut}
							onClick={handleSignOut}
							variant="destructive"
						>
							<LogOut className="h-4 w-4" />
							{isSigningOut ? "Signing out..." : "Logout"}
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</WireframeNav>
	);
}
