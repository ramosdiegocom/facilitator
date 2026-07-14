"use client";

import { authClient } from "@ramoz/auth/auth-client";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@ramoz/ui/components/dropdown-menu";
import {
	WireframeNav,
	WireframeSidebar,
	WireframeSidebarContent,
	WireframeSidebarHeader,
} from "@ramoz/ui/components/wireframe";
import { cn } from "@ramoz/ui/lib/utils";
import { House, KeyRound, LogOut, Settings, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { APP_STATE_STORAGE_KEY_PREFIX } from "@/providers/app-state-provider";

const navItems = [
	{
		href: "/dashboard/keys",
		label: "API Keys",
		icon: KeyRound,
	},
	{
		href: "/dashboard/settings/auth" as never,
		label: "Settings",
		icon: Settings,
	},
] as const;

export function DashboardNavigation({
	userEmail,
}: {
	userEmail?: string | null;
}) {
	const pathname = usePathname();
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
		<>
			<WireframeSidebar
				className="border-slate-200 border-r bg-white/95 backdrop-blur"
				hideOn="mobile"
				position="left"
			>
				<WireframeSidebarHeader className="px-4 py-4">
					<div className="font-bold text-lg text-slate-900">
						x402.diegolosramos.com
					</div>
				</WireframeSidebarHeader>
				<WireframeSidebarContent className="p-3">
					<nav className="flex flex-col gap-1">
						{navItems.map((item) => {
							const Icon = item.icon;
							const isActive = pathname === item.href;

							return (
								<Link
									className={cn(
										"flex items-center gap-2 rounded-xl px-3 py-2 font-medium text-sm transition",
										isActive
											? "bg-slate-900 text-white"
											: "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
									)}
									href={item.href}
									key={item.href}
								>
									<Icon className="h-4 w-4" />
									<span>{item.label}</span>
								</Link>
							);
						})}
					</nav>
				</WireframeSidebarContent>
			</WireframeSidebar>

			<WireframeNav
				className="border-slate-200 border-b bg-white/95 backdrop-blur"
				hideOn="desktop"
				position="top"
			>
				<div className="flex h-full items-center px-4">
					<span className="font-bold text-lg text-slate-900">
						x402.diegolosramos.com
					</span>
				</div>
			</WireframeNav>

			<WireframeNav
				className="border-slate-200 border-t bg-white/95 backdrop-blur"
				hideOn="desktop"
				position="bottom"
			>
				<div className="flex h-full items-center justify-end px-4">
					<DropdownMenu>
						<DropdownMenuTrigger className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50">
							<UserRound className="h-4 w-4" />
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-56">
							<DropdownMenuGroup>
								<DropdownMenuLabel>
									<p className="truncate text-slate-700 text-sm">
										{userEmail ?? "Account"}
									</p>
								</DropdownMenuLabel>
							</DropdownMenuGroup>
							<DropdownMenuItem onClick={() => router.push("/")}>
								<House className="h-4 w-4" />
								Home
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() => router.push("/dashboard/settings/auth" as never)}
							>
								<Settings className="h-4 w-4" />
								Settings
							</DropdownMenuItem>
							<DropdownMenuSeparator />
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
		</>
	);
}
