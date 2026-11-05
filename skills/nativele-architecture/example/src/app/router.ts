import { currentPath } from "./current-path.ts";
import "./route-message.ts";

type Tag = keyof HTMLElementTagNameMap;
type Params = Record<string, string | undefined>;

interface Route {
  pattern: URLPattern;
  tag: Tag;
  load: () => Promise<unknown>;
  props: (params: Params) => object;
}

function page<K extends Tag>(
  pathname: string,
  tag: K,
  load: () => Promise<unknown>,
  props: (params: Params) => Partial<HTMLElementTagNameMap[K]> = () => ({}),
): Route {
  return { pattern: new URLPattern({ pathname }), tag, load, props };
}

const routes: Route[] = [
  page("/", "projects-page", () => import("../features/projects/projects-page.ts")),
  page("/projects/:id", "project-page", () => import("../features/projects/project-page.ts"), (p) => ({ projectId: p.id ?? "" })),
  page("/settings", "settings-page", () => import("../features/settings/settings-page.ts")),
];

function mount<K extends Tag>(outlet: Element, tag: K, props: Partial<HTMLElementTagNameMap[K]>): void {
  const el = document.createElement(tag);
  Object.assign(el, props);
  outlet.replaceChildren(el);
}

async function loaded(route: Route): Promise<boolean> {
  try {
    await route.load();
    return true;
  } catch {
    return false;
  }
}

export async function show(outlet: Element, url: string, signal?: AbortSignal): Promise<void> {
  const route = routes.find((r) => r.pattern.test(url));
  const ok = route !== undefined && (await loaded(route));
  if (signal?.aborted) return;
  const path = new URL(url).pathname;
  if (route && ok) mount(outlet, route.tag, route.props(route.pattern.exec(url)?.pathname.groups ?? {}));
  else if (route) mount(outlet, "route-message", { heading: "This page could not be loaded", detail: "Check the connection and reload the page." });
  else mount(outlet, "route-message", { heading: "Page not found", detail: `Nothing lives at ${path}.` });
  currentPath.set(path);
}

export function startRouter(outlet: Element): Promise<void> {
  if ("navigation" in window) {
    navigation.addEventListener("navigate", (e) => {
      if (!e.canIntercept || e.hashChange || e.downloadRequest !== null || e.formData !== null) return;
      e.intercept({ handler: () => show(outlet, e.destination.url, e.signal) });
    });
  }
  return show(outlet, location.href);
}
