import { Component, define } from "@nativele/ts-dom";
import tpl from "./abort-load.html.js";

export class AbortLoad extends Component(tpl, { state: { status: "idle" } }) {
  override connected(): void {
    const ac = new AbortController();
    this.onCleanup(() => ac.abort());
    void this.#load(ac.signal);
  }
  async #load(signal: AbortSignal): Promise<void> {
    this.set({ status: "loading" });
    try {
      const res = await fetch("/api/slow", { signal });
      this.set({ status: res.ok ? await res.text() : "error" });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      this.set({ status: "error" });
    }
  }
}
define("abort-load", AbortLoad);
