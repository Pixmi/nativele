import { Component, define, event } from "@nativele/ts-dom";
import type { EmitEvent, EventHit } from "@nativele/ts-dom";
import childTpl from "./typed-child.html.js";
import tpl from "./typed.html.js";

export class TypedChild extends Component(childTpl, { emits: { "value-pick": event<{ value: string }>() } }) {
  pick(e: MouseEvent): void {
    this.emit("value-pick", { value: `MouseEvent=${e instanceof MouseEvent} button=${e.button}` });
  }
}
define("typed-child", TypedChild);

export class TypedBox extends Component(tpl) {
  received: string[] = [];
  override connected(): void {
    this.lists.rows.replace([{ id: "a", label: "A" }], (r) => r.id, (r, { text }) => {
      text.label = r.label;
    });
  }
  onPick(e: EmitEvent<TypedChild, "value-pick">): void {
    this.received.push(`pick CustomEvent=${e instanceof CustomEvent} ${e.detail.value}`);
  }
  onKey(e: KeyboardEvent): void {
    this.received.push(`key KeyboardEvent=${e instanceof KeyboardEvent} key=${e.key}`);
  }
  onRow(e: MouseEvent, hit: EventHit): void {
    this.received.push(`row MouseEvent=${e instanceof MouseEvent} button=${e.button} key=${String(hit.key)}`);
  }
}
define("typed-box", TypedBox);
