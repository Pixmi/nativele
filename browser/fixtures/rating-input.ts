import { Component, define } from "@nativele/ts-dom";
import type { EventHit } from "@nativele/ts-dom";
import tpl from "./rating-input.html.js";

const stars = [1, 2, 3, 4, 5].map((n) => ({ n }));

export class RatingInput extends Component(tpl, {
  props: { required: false },
  state: { value: 0, disabled: false },
}) {
  static formAssociated = true;
  #internals = this.attachInternals();

  pick(_e: MouseEvent, hit: EventHit<{ n: number }, "n">): void {
    this.set({ value: hit.key });
  }
  formResetCallback(): void {
    this.set({ value: 0 });
  }
  formDisabledCallback(disabled: boolean): void {
    this.set({ disabled });
  }
  override render(view: { value: number; disabled: boolean; required: boolean }, changed: ReadonlySet<"value" | "disabled" | "required">): void {
    this.lists.stars.replace(
      stars,
      (s) => s.n,
      (s, { text, el }) => {
        text.n = String(s.n);
        el.ariaPressed = String(s.n <= view.value);
        el.disabled = view.disabled;
      },
    );
    if (changed.has("value") || changed.has("required")) {
      this.#internals.setFormValue(view.value ? String(view.value) : null);
      const missing = view.required && !view.value;
      this.#internals.setValidity({ valueMissing: missing }, missing ? "Choose a rating." : "", this.lists.stars.get(1)?.el);
    }
  }
}
define("rating-input", RatingInput);
