import "@awesome.me/webawesome/dist/components/option/option.js";
import "@awesome.me/webawesome/dist/components/select/select.js";
import { Component, define, event } from "@nativele/ts-dom";
import tpl from "./theme-picker.html.js";
import { waUtilities } from "./wa-utilities.js";

export interface Theme {
  id: string;
  label: string;
}

export const THEMES: readonly Theme[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

export class ThemePicker extends Component(tpl, {
  shadow: true,
  props: { themes: [] as readonly Theme[] },
  emits: { "theme-change": event<{ theme: Theme }>() },
}) {
  constructor() {
    super();
    this.shadowRoot!.adoptedStyleSheets = [waUtilities];
  }
  onChange(): void {
    const theme = this.props.themes.find((t) => t.id === this.refs.select.value);
    if (theme) this.emit("theme-change", { theme });
  }
  override render(view: { themes: readonly Theme[] }): void {
    this.lists.themes.replace(view.themes, (t) => t.id, (t, { el, text }) => {
      el.value = t.id;
      text.label = t.label;
    });
  }
}
define("theme-picker", ThemePicker);
