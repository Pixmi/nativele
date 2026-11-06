import { Component, define, event } from "@nativele/ts-dom";
import type { EmitEvent } from "@nativele/ts-dom";
import tpl from "./tree.html.js";

export class TreeNode extends Component(tpl, { emits: { "tree-toggle": event<{ id: number }>() } }) {
  onToggle(e: EmitEvent<TreeNode, "tree-toggle">): void {
    void e.detail.id;
  }
  onClick(): void {
    this.emit("tree-toggle", { id: 1 });
  }
}
define("x-tree", TreeNode);
