import { Component, define } from "@nativele/ts-dom";
import tpl from "./life-probe.html.js";
import { log, ticks } from "./store.js";

export class LifeProbe extends Component(tpl, { props: { name: "" } }) {
  override connected(): void {
    log.push(`connected ${this.props.name}`);
    this.bind(ticks, (s) => {
      log.push(`tick ${this.props.name} ${s.n}`);
      this.refs.n.textContent = String(s.n);
    });
  }
  override disconnected(): void {
    log.push(`disconnected ${this.props.name}`);
  }
}
define("nv-life-probe", LifeProbe);
