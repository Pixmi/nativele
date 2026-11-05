---
name: nativele-zod
description: "Validate a form inside a Nativele component with Zod 4 (or Valibot 1): read the values on submit and on blur, safeParse, map issue paths (also nested and array fields) to per-field messages in state shown with data-if, set aria-invalid and aria-describedby, focus the first invalid field, and emit the parsed data typed with z.infer. Use when a project depends on zod or valibot and @nativele/ts-dom."
metadata:
  tier: experimental
  nativele: ">=0.5.2 <0.6.0"
  verified: "2026-11-05"
  tools: "zod@4.6.7 valibot@1.5.0 vite@8.3.6 typescript@7.0.2 create-vite@9.3.4"
  author: "Nativele maintainers"
  detects: "zod valibot"
---

# Nativele + Zod

## When to use

- An app that already uses Nativele (`@nativele/ts-dom`) validates a form inside a Nativele component with a schema library: on submit, and optionally when a field loses focus.
- Signals: `zod` (or `valibot`) and `@nativele/ts-dom` in `package.json`, a component template with a `<form>`.
- The form has more than a few fields, nested groups (`address.city`), or a repeated field (a list of guest emails). For two or three fields, the hand-written checks in the form validation recipe are enough (See also).
- Not for learning Zod or Valibot: this Skill covers only how their result reaches a Nativele component. Not for setting up Nativele in Vite (`npx ts-dom skills add nativele-vite`) or writing components in general (`npx ts-dom skills add nativele-core`).

## Versions

| Tool | Verified version |
|---|---|
| @nativele/ts-dom | 0.5.2 |
| zod | 4.6.7 (the procedure was also run with 3.25.76, with the schema changes in limitation 10) |
| valibot | 1.5.0 (limitation 11) |
| vite | 8.3.6 |
| typescript | 7.0.2 |
| create-vite (`vanilla-ts` template, the starting point) | 9.3.4 |

Verified on 2026-11-05 in Google Chrome 148, with Playwright against both the Vite dev server and `vite preview` of the production build, in a fresh `npm create vite@latest -- --template vanilla-ts` app set up with Nativele by the `nativele-vite` Skill (components in `src/nv/`). Zod 4 is the current major and the one these steps use. With a different major version of Zod or Valibot, treat every step as unverified.

## Set-up

Start from a Vite app that already uses Nativele, with the components in `src/nv/` and `npx ts-dom check src/nv` passing.

1. `npm i zod`.
2. Keep the schema in its own module next to the component, together with one function that runs `safeParse` and turns the issues into a map from path to message (`signup.ts` in the Example). The component imports only that function and the inferred type, so it never handles Zod objects, and a schema change touches one file.
3. In the template, give every input a `name` equal to its path in the schema, with dots for nested fields (`name="address.city"`), and the same `name` for every input of an array field (`name="guests"`). After each field, put one message element with an `id`, a `data-if` and a hole, both named `<field>Error` (`<p id="signup-city-error" data-if="cityError">{{ cityError }}</p>`). Add `novalidate` to the `<form>` so the browser does not show its own messages first.
4. In the component, keep all messages in one state field, `errors`, a map from the dot path to the message, and add one `derive` entry per message element that reads its path (`cityError: (s) => s.errors["address.city"] ?? ""`). Holes and `data-if` take a single name, never a path, so the derived names are what the template sees, and one `set({ errors })` updates every message at once.
5. Read the values in the handler with `FormData`, building the object the schema expects field by field (limitation 2), and pass it to the function from step 2:
   - on `submit`: `preventDefault()`, validate, `set({ errors })`, then focus the first `[aria-invalid=true]` in the form (rendering is synchronous, so the attributes are already set); when valid, clear `errors` and `emit` the parsed data;
   - on `focusout` of the form (optional): validate the whole form and copy only the message of the field that lost focus;
   - on `input` of the form: clear the message of the field being edited.
6. In `render`, set `aria-invalid` and `aria-describedby` on each input from `view.errors`, and fill the messages of array items in the list's `replace` callback.
7. Declare the event with the inferred output type: `emits: { "signup-submit": event<Signup>() }`, where `type Signup = z.infer<typeof SignupSchema>`. The parent then gets the parsed values (here `age` is a `number`), and `emit` with the raw form values is a tsc error.

## Example

```ts
// src/nv/signup.ts
import { z } from "zod";

export const SignupSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.email("Enter a valid email"),
  age: z.string().min(1, "Age is required").pipe(z.coerce.number<string>("Enter a number").int("Whole years only").min(18, "You must be 18 or older")),
  address: z.object({ city: z.string().trim().min(1, "City is required") }),
  guests: z.array(z.email("Enter a valid email")).max(3, "At most 3 guests"),
  terms: z.boolean().refine((v) => v, "Accept the terms"),
});

export type Signup = z.infer<typeof SignupSchema>;
export type Errors = Readonly<Record<string, string>>;

export function validateSignup(input: unknown): { ok: true; data: Signup } | { ok: false; errors: Errors } {
  const result = SignupSchema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) errors[issue.path.join(".")] ??= issue.message;
  return { ok: false, errors };
}
```

```html
<!-- src/nv/signup-form.html -->
<form data-ref="form" data-on-submit="submit" data-on-focusout="check" data-on-input="clearError" novalidate>
  <label>Name <input data-ref="name" name="name" autocomplete="name" /></label>
  <p id="signup-name-error" data-if="nameError">{{ nameError }}</p>
  <label>Email <input data-ref="email" name="email" type="email" /></label>
  <p id="signup-email-error" data-if="emailError">{{ emailError }}</p>
  <label>Age <input data-ref="age" name="age" inputmode="numeric" /></label>
  <p id="signup-age-error" data-if="ageError">{{ ageError }}</p>
  <label>City <input data-ref="city" name="address.city" /></label>
  <p id="signup-city-error" data-if="cityError">{{ cityError }}</p>
  <ul>
    <template data-each="guests">
      <li>
        <label>Guest email <input data-ref="guest" name="guests" /></label>
        <button type="button" data-on-click="removeGuest">Remove</button>
        <span data-ref="guestMsg" data-if="invalid">{{ message }}</span>
      </li>
    </template>
  </ul>
  <p id="signup-guests-error" data-if="guestsError">{{ guestsError }}</p>
  <button type="button" data-on-click="addGuest">Add guest</button>
  <label><input data-ref="terms" name="terms" type="checkbox" /> I accept the terms</label>
  <p id="signup-terms-error" data-if="termsError">{{ termsError }}</p>
  <button type="submit">Sign up</button>
</form>
```

```ts
// src/nv/signup-form.ts
import { Component, define, event } from "@nativele/ts-dom";
import type { DeepReadonly, EventHit } from "@nativele/ts-dom";
import { validateSignup, type Errors, type Signup } from "./signup.js";
import tpl from "./signup-form.html.js";

interface State {
  errors: Errors;
  guests: readonly { id: number }[];
}

function readForm(form: HTMLFormElement): unknown {
  const data = new FormData(form);
  return {
    name: data.get("name"),
    email: data.get("email"),
    age: data.get("age"),
    address: { city: data.get("address.city") },
    guests: data.getAll("guests"),
    terms: data.has("terms"),
  };
}

function pathOf(form: HTMLFormElement, input: HTMLInputElement): string {
  if (input.name !== "guests") return input.name;
  return `guests.${[...form.querySelectorAll("[name=guests]")].indexOf(input)}`;
}

export class SignupForm extends Component(tpl, {
  state: { errors: {}, guests: [] } as State,
  derive: {
    nameError: (s) => s.errors["name"] ?? "",
    emailError: (s) => s.errors["email"] ?? "",
    ageError: (s) => s.errors["age"] ?? "",
    cityError: (s) => s.errors["address.city"] ?? "",
    guestsError: (s) => s.errors["guests"] ?? "",
    termsError: (s) => s.errors["terms"] ?? "",
  },
  emits: { "signup-submit": event<Signup>() },
}) {
  #nextGuest = 1;

  addGuest(): void {
    this.set((s) => ({ guests: [...s.guests, { id: this.#nextGuest++ }], errors: {} }));
  }

  removeGuest(_e: Event, hit: EventHit<{ id: number }, "id">): void {
    this.set((s) => ({ guests: s.guests.filter((g) => g.id !== hit.key), errors: {} }));
  }

  submit(e: Event): void {
    e.preventDefault();
    const result = validateSignup(readForm(this.refs.form));
    if (!result.ok) {
      this.set({ errors: result.errors });
      this.refs.form.querySelector<HTMLElement>("[aria-invalid=true]")?.focus();
      return;
    }
    this.set({ errors: {} });
    this.emit("signup-submit", result.data);
  }

  check(e: Event): void {
    if (!(e.target instanceof HTMLInputElement) || e.target.type === "checkbox") return;
    const path = pathOf(this.refs.form, e.target);
    const result = validateSignup(readForm(this.refs.form));
    const message = result.ok ? "" : (result.errors[path] ?? "");
    this.set((s) => ({ errors: { ...s.errors, [path]: message } }));
  }

  clearError(e: Event): void {
    if (!(e.target instanceof HTMLInputElement)) return;
    const path = pathOf(this.refs.form, e.target);
    if (this.state.errors[path]) this.set((s) => ({ errors: { ...s.errors, [path]: "" } }));
  }

  override render(view: DeepReadonly<State>): void {
    const mark = (input: HTMLInputElement, path: string, id: string) => {
      const invalid = Boolean(view.errors[path]);
      input.ariaInvalid = invalid ? "true" : null;
      if (invalid) input.setAttribute("aria-describedby", id);
      else input.removeAttribute("aria-describedby");
    };
    mark(this.refs.name, "name", "signup-name-error");
    mark(this.refs.email, "email", "signup-email-error");
    mark(this.refs.age, "age", "signup-age-error");
    mark(this.refs.city, "address.city", "signup-city-error");
    mark(this.refs.terms, "terms", "signup-terms-error");
    this.lists.guests.replace(
      view.guests.map((g, i) => ({ id: g.id, message: view.errors[`guests.${i}`] ?? "" })),
      (g) => g.id,
      (g, { text, show, refs }) => {
        text.message = g.message;
        show("invalid", g.message !== "");
        refs.guest.ariaInvalid = g.message ? "true" : null;
        refs.guest.ariaDescribedByElements = g.message ? [refs.guestMsg] : null;
      },
    );
  }
}
define("signup-form", SignupForm);
```

The page that uses it (`index.html` has `<signup-form></signup-form>` and `<pre id="out"></pre>`):

```ts
// src/main.ts
import "./nv/signup-form.ts";
import type { EmitEvent } from "@nativele/ts-dom";
import type { SignupForm } from "./nv/signup-form.ts";

document.querySelector("signup-form")!.addEventListener("signup-submit", (e) => {
  const data = (e as EmitEvent<SignupForm, "signup-submit">).detail;
  document.querySelector("#out")!.textContent = JSON.stringify(data);
});
```

A file the app never imports, kept so `ts-dom check` proves the event carries the parsed type:

```ts
// src/nv/types-check.ts
import type { z } from "zod";
import type { EmitEvent } from "@nativele/ts-dom";
import type { Signup, SignupSchema } from "./signup.js";
import type { SignupForm } from "./signup-form.js";

declare const submitted: EmitEvent<SignupForm, "signup-submit">;
declare const raw: z.input<typeof SignupSchema>;
export const age: number = submitted.detail.age;
// @ts-expect-error the form's raw input has age as a string, not the parsed number
export const parsed: Signup = raw;
```

What it does, as checked in the browser:

- Submitting the empty form shows every message (`Name is required`, `Enter a valid email`, `Age is required`, `City is required`, `Accept the terms`), sets `aria-invalid="true"` and `aria-describedby` on each invalid input, and focuses the name field. Chrome's accessibility tree then reports the name input as invalid with the description `Name is required`.
- Typing in a field removes only that field's message and its two attributes. Submitting again focuses the next invalid field in document order.
- Leaving a field shows its message (`bad` in email shows `Enter a valid email`; age `abc`, `17` and `18.5` show `Enter a number`, `You must be 18 or older` and `Whole years only`).
- An invalid second guest shows `Enter a valid email` inside that list item only; four guests show `At most 3 guests` under the list.
- A valid submit clears every message and emits `{ name, email, age: 36, address: { city }, guests: [...], terms: true }`, with `age` a number.

## Known limitations

1. **One derived name per message.** A hole and a `data-if` take a single identifier, so `{{ errors.name }}` is a template error. Keep the map in state and add a `derive` entry per message element; a name used in the template that is not in `derive` is a `missing-binding` tsc error, which `ts-dom check` reports.
2. **Build the input object from `FormData` by hand.** In Chrome, `FormData.get` returns the string (`""` for an empty input) or `null` for a name the form does not have, which Zod reports as `Invalid input: expected string, received null`. `Object.fromEntries(new FormData(form))` looks shorter but loses data: repeated names keep only the last value (`guests` became one string), an unchecked checkbox is missing and a checked one is `"on"`, and nested names stay flat keys (`"address.city"`). So read each field: `get` for single values, `getAll` for repeated names, `has` for a checkbox, and nest the object as the schema does. Reading `this.refs.x.value` in a handler works as well; the `unguarded-input-value` lint rule reports only a `render()` that writes a control's value without comparing it first, and neither reading values nor writing them in a handler (`form.reset()` after submit) is reported. This procedure writes no value in `render`.
3. **Numbers from text inputs.** `z.coerce.number()` turns `""` into `0` (in Zod 4.6.7 and 3.25.76 alike), so an empty age fails with `Too small: expected number to be >=18` instead of a "required" message, or passes when `0` is allowed. Check the string first and coerce after: `z.string().min(1, "Age is required").pipe(z.coerce.number<string>("Enter a number")...)`. Without the `<string>` type argument, Zod 4's `pipe` is a tsc error (`TS2345 ... Type 'unknown' is not assignable to type 'string'`). Zod reports a non-number such as `abc` with the coerce message (`Enter a number`).
4. **Nested fields** (paths with more than one segment): name the input with the dot path (`name="address.city"`), nest the value in `readForm`, and key the map with `issue.path.join(".")`, so the input name, the issue path and the map key are the same string. Do not use `z.flattenError(error)` (or Zod 3's `error.flatten()`): its `fieldErrors` keep only the first path segment, so `address.city` comes back under `address`.
5. **Array fields**: an issue inside an array has the index in its path (`guests.1`); one about the array itself (`.max(3)`) has the field name only (`guests`). Show item messages in the `replace` callback of the list, by index, and the array message in its own element under the list. `pathOf` maps a repeated input to its index in document order, which is the order `getAll` returns. Adding or removing an item shifts the indexes, so the example clears `errors` then. An item's elements are not in the component's `refs`, so its input gets `aria-invalid` in the callback, and its description is set with `ariaDescribedByElements`, because an id inside a `data-each` template repeats for every item (`id-in-list`).
6. **Ids repeat when the component is on a page more than once.** In the default Light DOM, each instance renders the same `id`s, and `aria-describedby="signup-name-error"` then finds the first one in the document. For a form that can appear more than once, drop the ids, put a `data-ref` on the message element (`<p data-ref="nameMsg" data-if="nameError">`) and set `this.refs.name.ariaDescribedByElements = view.nameError ? [this.refs.nameMsg] : null` in `render`. This was verified with two instances in Chrome 148 (each input described by its own message; at the component level, unlike in a list item, a ref on a `data-if` element is there even while the block is hidden), and TypeScript 7 types the property; other browsers were not checked.
7. **Blur does not bubble.** Use `data-on-focusout` on the `<form>`, which receives every field's blur; `e.target` is the field. Validate the whole form and take only that field's message, so checks that read more than one field still apply. The example skips checkboxes on blur, because tabbing past an unchecked box would show its message too early.
8. **`aria-invalid` needs the value `"true"`.** `toggleAttribute("aria-invalid", on)` writes `aria-invalid=""`, which Chrome's accessibility tree reports as not invalid. Set `input.ariaInvalid = invalid ? "true" : null`. Whether a screen reader announces the message was not checked; the accessibility tree shows each invalid input with its message as the description.
9. **Checks across fields**: `.refine((d) => d.password === d.confirm, { message: "Passwords differ", path: ["confirm"] })` puts the message under `confirm`, and in Zod 4.6.7 it ran together with a failing `min(1)` on another field (checked with `safeParse` in Node, not in the browser example). Give such a refinement a `path`; without one its path is empty and the map key is `""`, which no field shows. A field that fails a `z.literal(...)` stops the object-level `refine` from running: with `terms: z.literal(true)` and the box unchecked, a password mismatch is not reported. That is why the example checks the box with `z.boolean().refine(...)`; Valibot's `v.literal(true)` does not have this problem.
10. **Zod 4 vs Zod 3.** These steps use Zod 4. The same component, `verify.mjs` and `issue.path.join(".")` passed with Zod 3.25.76 after these schema changes:

    | In the schema | Zod 4.6.7 | Zod 3.25.76 |
    |---|---|---|
    | email | `z.email("...")` | `z.string().email("...")` (`z.email` does not exist) |
    | coerced number message | `z.coerce.number<string>("...")` | `z.coerce.number({ invalid_type_error: "..." })` (no type argument: `TS2558`) |
    | message of a literal | `z.literal(true, "...")` | `z.literal(true, { errorMap: () => ({ message: "..." }) })` (a string is `TS2559`) |
    | flattening issues | `z.flattenError(error)`, only the first segment (limitation 4) | `error.flatten()`, the same |

    `safeParse`, `result.error.issues`, `issue.path`, `issue.message` and `z.infer` were used the same way in both.

11. **Valibot 1.5.0 fits the same procedure.** Only `signup.ts` changes; the component, template and `verify.mjs` passed unchanged:

    ```ts
    // src/nv/signup.ts with Valibot
    import * as v from "valibot";

    export const SignupSchema = v.object({
      name: v.pipe(v.string(), v.trim(), v.minLength(1, "Name is required")),
      email: v.pipe(v.string("Enter a valid email"), v.email("Enter a valid email")),
      age: v.pipe(v.string(), v.minLength(1, "Age is required"), v.transform(Number), v.number("Enter a number"), v.integer("Whole years only"), v.minValue(18, "You must be 18 or older")),
      address: v.object({ city: v.pipe(v.string(), v.trim(), v.minLength(1, "City is required")) }),
      guests: v.pipe(v.array(v.pipe(v.string(), v.email("Enter a valid email"))), v.maxLength(3, "At most 3 guests")),
      terms: v.literal(true, "Accept the terms"),
    });

    export type Signup = v.InferOutput<typeof SignupSchema>;
    export type Errors = Readonly<Record<string, string>>;

    export function validateSignup(input: unknown): { ok: true; data: Signup } | { ok: false; errors: Errors } {
      const result = v.safeParse(SignupSchema, input);
      if (result.success) return { ok: true, data: result.output };
      const errors: Record<string, string> = {};
      for (const issue of result.issues) errors[v.getDotPath(issue) ?? ""] ??= issue.message;
      return { ok: false, errors };
    }
    ```

    For the `types-check.ts` file, use `v.InferInput<typeof SignupSchema>` instead of `z.input`. Valibot's issue path is a list of objects, not keys; `v.getDotPath(issue)` gives the same dot path (`address.city`, `guests.1`). The parsed data is `result.output`, the type `v.InferOutput`. A check across fields is `v.forward(v.partialCheck([["password"], ["confirm"]], (d) => d.password === d.confirm, "Passwords differ"), ["confirm"])` on the object's `v.pipe` (checked in Node). The production bundle of this example page was 26.42 kB (9.55 kB gzip) with Valibot and 106.08 kB (31.88 kB gzip) with Zod 4.
12. Not verified: Zod Mini, the `zod/v4` entry of Zod 3.25, async refinements (`safeParseAsync`), `<select multiple>`, file inputs, forms inside a `shadow: true` component, the `role="alert"` of the recipe together with `aria-describedby`, screen reader output, and browsers other than Chrome.

## Verify

Run in the project:

```sh
npx ts-dom check src/nv    # expect: ts-dom check: no issues (types-check.ts included)
npx ts-dom lint src/nv --a11y   # expect: ts-dom lint: no issues
npm run build              # expect: ts-dom check: no issues, then ✓ built
```

The `@ts-expect-error` in `types-check.ts` and the check below rely on a field whose parsed type differs from its input (here `age`, a string that becomes a number); for a schema without such a transform, input and output types are equal and the directive is reported as unused (`TS2578`), so drop it. Change `event<Signup>()` to `event<z.input<typeof SignupSchema>>()` once to see the type check work: `ts-dom check` must then report `TS2345` at the `emit` (`Type 'number' is not assignable to type 'string'` for `age`) and `TS2322` in `types-check.ts`.

In the browser, against `npm run dev` and against `npx vite preview` of the build, check with a test (Playwright or by hand):

- submitting the empty form shows one message per field, sets `aria-invalid="true"` and `aria-describedby` on those inputs, and focuses the first of them;
- typing in a field removes only its message and both attributes; submitting again focuses the next invalid field;
- leaving a field with a wrong value shows its message;
- a wrong item in an array field shows its message in that item only, the item's input is invalid and described by that message in the accessibility tree, and an array-level issue shows under the list;
- a valid submit emits the parsed values (numbers as numbers), clears every message, and the console has no errors or warnings.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `ts-dom check`: `[missing-binding] "nameMessage" is used by {{ nameMessage }} ... declares no state, prop or derived value of that name`, followed by many `TS7006 ... implicitly has an 'any' type` errors | a hole or `data-if` name that is not a `derive` entry; the other errors follow from it | add the `derive` entry (`nameMessage: (s) => s.errors["name"] ?? ""`) and check again |
| `ts-dom gen`: `[invalid-hole]` | `{{ errors.name }}` in the template | use the derived name (`{{ nameError }}`) |
| A nested field never shows its message | the map was built with `z.flattenError` / `error.flatten()`, or the input `name` is not the dot path | key by `issue.path.join(".")` and name the input `address.city` |
| Every message shows, but the submitted object has one guest instead of all | `Object.fromEntries(new FormData(form))` | `data.getAll("guests")` |
| An empty number field passes, or fails with `Too small: expected number to be >=...` | `z.coerce.number()` turns `""` into `0` | `z.string().min(1, "...").pipe(z.coerce.number<string>(...))` |
| tsc `TS2345 ... '_zod.input' are incompatible ... Type 'unknown' is not assignable to type 'string'` on a `pipe` | `z.coerce.number()` without the `<string>` type argument after `z.string()` | `z.coerce.number<string>()` |
| A field shows `Invalid input: expected string, received null` | `readForm` reads a name the form does not have | match the `get` names to the inputs' `name` attributes |
| The accessibility tree reports the field as not invalid although its message shows | `aria-invalid=""` from `toggleAttribute` | `input.ariaInvalid = invalid ? "true" : null` |
| Nothing focuses on submit | the focus query runs before `set`, or `aria-invalid` is not `"true"` | call `set({ errors })` first, then query `[aria-invalid=true]` |
| The blur message never shows | `data-on-blur` on the form (blur does not bubble) | `data-on-focusout` on the form |
| After switching Zod versions, the dev server still runs the old one (Zod 4 messages from a Zod 3 schema) | Vite keeps its pre-bundled copy until it restarts | restart `npm run dev`; it prints `Re-optimizing dependencies because lockfile has changed` |

## See also

- The form validation recipe this extends (messages in state, `data-if`, clearing on input): https://github.com/Pixmi/nativele/blob/main/docs/recipes.md#form-validation
- `state`, `derive`, `render` and `changed`: https://github.com/Pixmi/nativele/blob/main/docs/components.md#data-and-view-state-optional
- `emits`, `event<T>()` and `EmitEvent`: https://github.com/Pixmi/nativele/blob/main/docs/components.md#data-flow-props-down-events-up
- Event delegation, `focusout` and blur: https://github.com/Pixmi/nativele/blob/main/docs/components.md#events-data-on-
- Writing form control values in `render` (`unguarded-input-value`): https://github.com/Pixmi/nativele/blob/main/docs/components.md#a-small-reminder-about-form-inputs
- Lists, `replace` and `show` in items: https://github.com/Pixmi/nativele/blob/main/docs/lists.md#items-as-plain-elements-replace
- Setting up Nativele in the Vite app: `npx ts-dom skills nativele-vite`
