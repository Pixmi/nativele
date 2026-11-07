import { scenarios } from "./scenarios.ts";

(window as unknown as { scenarios: typeof scenarios }).scenarios = scenarios;
