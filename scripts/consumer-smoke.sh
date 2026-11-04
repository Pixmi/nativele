#!/usr/bin/env bash
# Install the packed package into a fresh project and verify the consumer flow: gen -> tsc -> lint (with a11y) -> vp build
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

cd "$ROOT"
npm run build:lib >/dev/null
TGZ="$(npm pack --silent --pack-destination "$WORK" | tail -1)"

cd "$WORK"
npm init -y >/dev/null
npm pkg set type=module >/dev/null
# Install vite-plus first and the package second: in a single install npm may not hoist vite to the top level
npm i -D vite-plus@1.4.0 typescript@7.0.2 @types/node >/dev/null
npm i -D "./$TGZ" >/dev/null
mkdir src

cat > vite.config.ts <<'CFG'
import { defineConfig } from "vite-plus";
import { nativele } from "nativele/vite";
export default defineConfig({
  plugins: [nativele({ a11y: true })],
  lint: {
    ignorePatterns: ["node_modules", "dist", "**/*.html.ts"],
    jsPlugins: [{ name: "nativele", specifier: "nativele/oxlint" }],
    rules: { "nativele/unused-markup": "error", "nativele/a11y": "warn" },
  },
});
CFG
cat > tsconfig.json <<'CFG'
{ "compilerOptions": { "target": "ES2022", "module": "ESNext", "moduleResolution": "bundler",
  "lib": ["ES2022", "DOM"], "strict": true, "noEmit": true,
  "skipLibCheck": true, "types": ["node"] }, "include": ["src", "vite.config.ts"] }
CFG
cat > src/hello.html <<'HTML'
<style scoped>:scope { display: block }</style>
<h1>Hi {{ name }}</h1>
<button data-ref="btn" type="button">go</button>
<ul><template data-each="rows"><li>{{ n }}<b data-if="hot">!</b></li></template></ul>
<slot name="extra"></slot>
HTML
cat > src/hello.ts <<'TS'
import { Component, createStore, define } from "nativele";
import tpl from "./hello.html.js";

class Hello extends Component(tpl) {
  readonly s = createStore({ rows: [{ id: 1, n: "a", hot: true }] });
  override connected() {
    this.text.name = "world";
    this.bind(this.s, (v) =>
      this.lists.rows.replace(v.rows, (r) => r.id, (r, { text, show }) => {
        text.n = r.n;
        show("hot", r.hot);
      }),
    );
    this.on(this.refs.btn, "click", () => this.s.set((v) => ({ rows: [...v.rows, { id: 2, n: "b", hot: false }] })));
  }
  override slotchange(name: "extra") {
    void name;
  }
}
define("x-hello", Hello);
TS
echo '<!doctype html><x-hello></x-hello><script type="module" src="/src/hello.ts"></script>' > index.html

echo "[smoke] gen";   npx nativele gen
echo "[smoke] tsc";   npx tsc
echo "[smoke] lint";  npx nativele lint --a11y --strict
echo "[smoke] vp lint"; npx vp lint
echo "[smoke] build"; npx vp build >/dev/null
test -s dist/index.html
# Make sure the type check really rejects a wrong name
echo 'import tpl from "./hello.html.js"; import { Component } from "nativele"; class X extends Component(tpl) { m() { this.refs.nope; } } void X;' > src/bad.ts
if npx tsc >/dev/null 2>&1; then echo "[smoke] expected tsc to fail but it passed" >&2; exit 1; fi
echo "[smoke] OK"
