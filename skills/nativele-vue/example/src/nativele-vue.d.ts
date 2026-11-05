import type { HTMLAttributes } from "vue";

type NativeleTag = Extract<keyof HTMLElementTagNameMap, `${string}-${string}`>;
type Camelize<S extends string> = S extends `${infer A}-${infer B}` ? `${A}${Capitalize<Camelize<B>>}` : S;
type NativeleProps<E> = E extends { readonly props: infer P } ? { [K in keyof P & keyof E]?: E[K] } : unknown;
type NativeleEvents<E> = E extends { readonly "~emits"?: infer M }
  ? { [K in keyof NonNullable<M> & string as `on${Capitalize<Camelize<K>>}`]?: (event: CustomEvent<NonNullable<M>[K]>) => void }
  : unknown;
type NativeleComponents = {
  [K in NativeleTag]: new () => {
    $props: HTMLAttributes & NativeleProps<HTMLElementTagNameMap[K]> & NativeleEvents<HTMLElementTagNameMap[K]>;
  };
};

declare module "vue" {
  interface GlobalComponents extends NativeleComponents {}
}
