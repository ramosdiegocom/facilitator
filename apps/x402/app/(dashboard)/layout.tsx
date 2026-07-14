import { auth } from "@ramoz/auth";
import { Wireframe } from "@ramoz/ui/components/wireframe";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardTopNavbar } from "@/app/(dashboard)/dashboard-top-navbar";
import { DashboardNavigation } from "./dashboard-navigation";

export const metadata: Metadata = {
	title: "Dashboard",
	description: "Developer dashboard",
};

export default async function DashboardLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const session = await auth.api.getSession({
		headers: await headers(),
	});

	if (!session) {
		redirect("/login");
	}

	return (
		<Wireframe
			config={{
				cssVariables: {
					"--bottom-nav-height": 14,
					"--left-sidebar-width-expanded": 64,
					"--left-sidebar-width-collapsed": 16,
				},
			}}
		>
			<DashboardNavigation userEmail={session.user.email} />
			<main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
				<DashboardTopNavbar userEmail={session.user.email} />
				{children}
			</main>
		</Wireframe>
	);
}
