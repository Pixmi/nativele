import { Component, define } from "@nativele/ts-dom";
import tpl from "./media.html.js";

export class MediaBox extends Component(tpl) {
  seen: string[] = [];
  ready(): void {
    this.seen.push("canplay");
  }
  closed(): void {
    this.seen.push("close");
  }
  hit(e: Event): void {
    this.seen.push(e.type);
  }
}
define("media-box", MediaBox);
