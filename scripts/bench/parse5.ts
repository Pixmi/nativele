import { parseFragment as parse } from "parse5";
import { counts } from "./count.ts";

export * from "parse5";
export const parseFragment = ((...args: never[]) => (counts.parses++, (parse as (...a: never[]) => unknown)(...args))) as typeof parse;
