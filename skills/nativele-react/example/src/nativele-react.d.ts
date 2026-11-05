import type { DetailedHTMLProps, HTMLAttributes } from "react";

type NativeleTag = Extract<keyof HTMLElementTagNameMap, `${string}-${string}`>;
type NativeleProps<E> = E extends { readonly props: infer P } ? { [K in keyof P & keyof E]?: E[K] } : unknown;
type NativeleEvents<E> = E extends { readonly "~emits"?: infer M }
  ? { [K in keyof NonNullable<M> & string as `on${K}`]?: (event: CustomEvent<NonNullable<M>[K]>) => void }
  : unknown;
type NativeleElementProps<E extends HTMLElement> = Omit<DetailedHTMLProps<HTMLAttributes<E>, E>, keyof NativeleProps<E>> &
  NativeleProps<E> &
  NativeleEvents<E>;
type NativeleIntrinsics = { [K in NativeleTag]: NativeleElementProps<HTMLElementTagNameMap[K]> };

declare module "react" {
  namespace JSX {
    interface IntrinsicElements extends NativeleIntrinsics {}
  }
}
