export type DemoIdentity = {
	id: string;
	label: string;
	address: `0x${string}`;
};

export const DEMO_STREAMERS: readonly DemoIdentity[] = [
	{
		id: "streamer-rhea",
		label: "Rhea Streams",
		address: "0x8D2f8a8A28d3674cf3C6df9B8a8A9f2f5E1348E8",
	},
	{
		id: "streamer-kaito",
		label: "Kaito Live",
		address: "0x2fA4B7d827a2f1A018f8D17b03260AE2D479e72B",
	},
] as const;

export const DEMO_VIEWERS: readonly DemoIdentity[] = [
	{
		id: "viewer-maya",
		label: "Maya Viewer",
		address: "0x4f2A8bD38C7b5E1d9478fD22e4f8B2a773f66501",
	},
	{
		id: "viewer-dan",
		label: "Dan Viewer",
		address: "0x71D45B3A8dE41C27A1f2F3401d9C6E4Af4E95cB2",
	},
	{
		id: "viewer-lina",
		label: "Lina Viewer",
		address: "0xA3E2c0D64fB8F8A1170C56F4F8d273D3AEA92815",
	},
] as const;

export function getViewerById(id: string) {
	return DEMO_VIEWERS.find((identity) => identity.id === id) ?? null;
}

export function getStreamerById(id: string) {
	return DEMO_STREAMERS.find((identity) => identity.id === id) ?? null;
}
