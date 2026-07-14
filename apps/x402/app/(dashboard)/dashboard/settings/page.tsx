import { redirect } from "next/navigation";

export default async function DashboardSettingsPage() {
	redirect("/dashboard/settings/auth" as never);
}
