import { adminOrpcServer } from "@/utils/orpc-admin.server";
import { AuthSettingsPanel } from "./settings-panel";

export default async function DashboardAuthSettingsPage() {
	const initialData = await adminOrpcServer.authSettings.getAuthSettings();

	return (
		<div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
			<AuthSettingsPanel initialData={initialData} />
		</div>
	);
}
