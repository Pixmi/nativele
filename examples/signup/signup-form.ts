import { Component, define } from "ts-dom";
import type { EmitEvent, EventHit } from "ts-dom";
import type { FormField } from "./form-field.js";
import tpl from "./signup-form.html.js";

interface Entry {
  id: number;
  name: string;
  email: string;
}
interface State {
  name: string;
  email: string;
  agree: boolean;
  entries: Entry[];
}

const nameError = (s: Readonly<State>) => (s.name.trim() === "" ? "Please enter your name" : "");
const emailError = (s: Readonly<State>) => (/^\S+@\S+\.\S+$/.test(s.email) ? "" : "Please enter a valid email");

/**
 * The parent owns the form data (state) and passes values and error messages down to form-field (props);
 * children only notify upwards through the field-input / remove-entry events, which only reach their direct parent.
 */
export class SignupForm extends Component(tpl, {
  state: { name: "", email: "", agree: false, entries: [] } as State,
  derive: {
    nameError,
    emailError,
    canSubmit: (s) => nameError(s) === "" && emailError(s) === "" && s.agree,
    count: (s) => s.entries.length,
    empty: (s) => s.entries.length === 0,
  },
}) {
  #nextId = 1;

  onName(e: Event): void {
    this.set({ name: (e as EmitEvent<FormField, "field-input">).detail.value });
  }
  onEmail(e: Event): void {
    this.set({ email: (e as EmitEvent<FormField, "field-input">).detail.value });
  }
  onAgree(): void {
    this.set({ agree: this.refs.agree.checked });
  }
  onSubmit(e: Event): void {
    e.preventDefault();
    if (!this.#canSubmit()) return;
    this.set((s) => ({
      entries: [...s.entries, { id: this.#nextId++, name: s.name.trim(), email: s.email }],
      name: "",
      email: "",
      agree: false,
    }));
  }
  removeEntry(_e: Event, hit: EventHit): void {
    this.set((s) => ({ entries: s.entries.filter((x) => x.id !== hit.key) }));
  }

  #canSubmit(): boolean {
    return nameError(this.state) === "" && emailError(this.state) === "" && this.state.agree;
  }

  override render(v: State & { nameError: string; emailError: string; canSubmit: boolean }, changed: ReadonlySet<string>): void {
    // Data flows down: the children's props are fully typed, so a wrong name or type is a tsc error
    this.refs.name.value = v.name;
    this.refs.name.error = v.nameError;
    this.refs.email.value = v.email;
    this.refs.email.error = v.emailError;
    this.refs.agree.checked = v.agree;
    this.refs.submit.disabled = !v.canSubmit;
    if (changed.has("entries")) {
      this.lists.entries.replace(
        v.entries,
        (x) => x.id,
        (x, { refs }) => {
          refs.row.name = x.name;
          refs.row.email = x.email;
        },
        { skipUnchanged: true },
      );
    }
  }
}
define("signup-form", SignupForm);
