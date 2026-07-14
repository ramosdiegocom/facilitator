"use client";

import type { ReactNode } from "react";
import { createContext, useContext } from "react";

export const APP_STATE_STORAGE_KEY_PREFIX = "app-state";

type AppStateContext =
	| {
			hello: string;
	  }
	| undefined;

const AppStateContext = createContext<AppStateContext>(undefined);

export function AppStateProvider({ children }: { children: ReactNode }) {
	return (
		<AppStateContext.Provider value={{ hello: "world" }}>
			{children}
		</AppStateContext.Provider>
	);
}

export function useAppState() {
	const context = useContext(AppStateContext);
	if (!context) {
		throw new Error("useAppState must be used within a AppStateProvider");
	}
	return context;
}
