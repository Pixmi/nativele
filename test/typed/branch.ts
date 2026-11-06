import { Component, define } from "@nativele/ts-dom";
import tpl from "./branch.html.js";

export interface BranchNode {
  id: number;
  label: string;
  children: BranchNode[];
}

export class Branch extends Component(tpl, {
  props: { node: null as BranchNode | null, open: false },
  derive: { label: (s) => s.node?.label ?? "" },
}) {
  openChild(id: number): void {
    const child = this.lists.children.get(id);
    if (child) child.el.open = true;
  }
}
define("x-branch", Branch);
