import { createStore } from "@nativele/ts-dom";

export const ticks = createStore({ n: 0 });
export const log: string[] = [];
(globalThis as { nvLog?: string[] }).nvLog = log;
