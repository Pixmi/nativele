import type { ListSchema } from "./list.ts";

/** The description of a template's structure, produced by codegen. */
export interface Schema {
  refs: Record<string, Element>;
  lists: Record<string, ListSchema>;
  /** Names of the {{ hole }}s */
  text: string;
  /** Method names referenced by data-on-* */
  events: string;
  ifs: string;
  slots: string;
}

export interface Template<S extends Schema = Schema> {
  readonly html: string;
  /** Type inference only; does not exist at runtime. */
  readonly __schema?: S;
}

export type El<K extends string> = K extends keyof HTMLElementTagNameMap
  ? HTMLElementTagNameMap[K]
  : HTMLElement;

export function template<S extends Schema = Schema>(html: string): Template<S> {
  return { html };
}
