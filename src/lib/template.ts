import type { List, ListSchema, TextOf } from "./list.ts";
import { mountTemplate } from "./mount.ts";

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

/**
 * A template's parsed markup, written by codegen: a string is a text node, `["#comment", text]` a comment,
 * and `[tag, attributes, children, namespace?]` an element (a `<template>` element's children become its content).
 */
export type TemplateNode = string | readonly [tag: string, attrs: Readonly<Record<string, string>>, children: readonly TemplateNode[], ns?: string] | readonly ["#comment", string];

/** A template built without a component: the nodes, and the typed handles to the places the template names. */
export interface TemplateInstance<S extends Schema> {
  /** The built nodes; insert it (or its children) where it should show. */
  readonly root: DocumentFragment;
  /** The elements marked with `data-ref`. */
  readonly refs: S["refs"];
  /** The `data-each` lists. */
  readonly lists: { [K in keyof S["lists"]]: List<S["lists"][K]> };
  /** The `{{ name }}` holes: assigning a value updates every place the hole appears. */
  readonly text: TextOf<S["text"]>;
  /** Shows or hides the `data-if` elements of that name; hidden until shown. */
  show(name: S["ifs"], on: boolean): void;
}

export interface Template<S extends Schema = Schema> {
  /** Builds a fresh copy of the markup with DOM calls only, so no HTML string is parsed and Trusted Types has nothing to block. */
  build(): DocumentFragment;
  /**
   * Builds the template and wires up `refs`, `lists`, `text` and `show` without a component or custom element, e.g. for a menu item created in code.
   * There is no host element, so `data-on-*` attributes do nothing here (listen on `refs`), and `<slot>` is not projected.
   */
  instantiate(): TemplateInstance<S>;
  /** Type inference only; does not exist at runtime. */
  readonly __schema?: S;
}

export type El<K extends string> = K extends keyof HTMLElementTagNameMap
  ? HTMLElementTagNameMap[K]
  : HTMLElement;

export function template<S extends Schema = Schema>(nodes: readonly TemplateNode[]): Template<S> {
  return {
    build: () => buildNodes(nodes),
    instantiate() {
      const root = buildNodes(nodes);
      const { refs, lists, text, conds } = mountTemplate(root);
      conds.hideAll();
      return { root, refs, lists, text, show: conds.show } as unknown as TemplateInstance<S>;
    },
  };
}

function buildNodes(nodes: readonly TemplateNode[]): DocumentFragment {
  const frag = document.createDocumentFragment();
  for (const node of nodes) frag.append(buildNode(node));
  return frag;
}

function buildNode(node: TemplateNode): Node {
  if (typeof node === "string") return document.createTextNode(node);
  if (node[0] === "#comment") return document.createComment(node[1] as string);
  const [tag, attrs, children, ns] = node as readonly [string, Readonly<Record<string, string>>, readonly TemplateNode[], string?];
  const el = ns ? document.createElementNS(ns, tag) : document.createElement(tag);
  for (const name in attrs) el.setAttribute(name, attrs[name] as string);
  const into = el instanceof HTMLTemplateElement ? el.content : el;
  for (const child of children) into.append(buildNode(child));
  return el;
}
