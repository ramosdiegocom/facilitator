import { createSeoConfig } from "@ramoz/seo";

export const { generateMetadata, generateOgImage } = createSeoConfig({
	baseUrl: "https://ramosdiego.com",
	primaryColor: "#6366f1",
	siteName: "Ramoz",
});
