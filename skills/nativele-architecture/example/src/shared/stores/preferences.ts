import { createStore } from "@nativele/ts-dom";

export interface Preferences {
  userName: string;
  showDone: boolean;
}

export const defaultPreferences: Preferences = { userName: "", showDone: true };

export const preferences = createStore<Preferences>(defaultPreferences);
