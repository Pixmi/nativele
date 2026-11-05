import { Component, define, event } from "@nativele/ts-dom";
import tpl from "./form-field.html.js";

/**
 * A single field. Data flow:
 * - props (given by the parent, read-only): label, value, error, type
 * - state (owned by the field): touched, so the error is only shown after the user has touched the field; the parent does not need to know
 * - emits (notify upwards): field-input
 */
export class FormField extends Component(tpl, {
  props: { label: "", value: "", error: "", type: "text" },
  state: { touched: false },
  derive: { showError: (s) => s.touched && s.error !== "" },
  emits: { "field-input": event<{ value: string }>() },
}) {
  onInput(): void {
    this.set({ touched: true });
    this.emit("field-input", { value: this.refs.input.value });
  }
  onBlur(): void {
    this.set({ touched: true });
  }

  override render(v: { value: string; type: string; error: string; showError: boolean }, changed: ReadonlySet<"value" | "type">): void {
    // Only write the value when it really differs: while the user types, the value is emitted to the parent and comes back through props;
    // writing the same value again would move the caret to the end
    if (changed.has("value") && this.refs.input.value !== v.value) this.refs.input.value = v.value;
    if (changed.has("value") && v.value === "") this.set({ touched: false }); // the parent cleared the field: start over
    if (changed.has("type")) this.refs.input.type = v.type;
    this.refs.input.setAttribute("aria-invalid", String(v.showError));
  }
}
define("form-field", FormField);
