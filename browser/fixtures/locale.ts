import { createStore } from "@nativele/ts-dom";

export const messages = {
  en: { hello: "Hello", items: (n: number) => (n === 1 ? "1 item" : `${n} items`) },
  fr: { hello: "Bonjour", items: (n: number) => (n <= 1 ? `${n} article` : `${n} articles`) },
};
export type Locale = keyof typeof messages;

export const locale = createStore<Locale>("en");

export function setLocale(next: Locale): void {
  document.documentElement.lang = next;
  locale.set(next);
}
