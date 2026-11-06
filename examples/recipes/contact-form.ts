import { Component, define, event } from "@nativele/ts-dom";
import tpl from "./contact-form.html.js";

export class ContactForm extends Component(tpl, {
  state: { nameError: "", emailError: "" },
  emits: { "contact-add": event<{ name: string; email: string }>() },
}) {
  open(): void {
    this.refs.form.reset();
    this.clearErrors();
    this.refs.dialog.showModal();
  }
  cancel(): void {
    this.refs.dialog.close();
  }
  clearErrors(): void {
    this.set({ nameError: "", emailError: "" });
  }
  submit(e: Event): void {
    e.preventDefault();
    const { elements } = this.refs.form;
    const name = elements.name.value.trim();
    const email = elements.email.value.trim();
    const nameError = name ? "" : "Name is required";
    const emailError = /^\S+@\S+\.\S+$/.test(email) ? "" : "Enter a valid email";
    this.set({ nameError, emailError });
    if (nameError || emailError) return;
    this.emit("contact-add", { name, email });
    this.refs.dialog.close();
  }
}
define("contact-form", ContactForm);
