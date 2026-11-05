import { createStore } from "@nativele/ts-dom";

export const currentPath = createStore(location.pathname);
