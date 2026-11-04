# Nativele

以 TypeScript 驅動、HTML 優先的 UI 函式庫。

[English](README.md) | 繁體中文

用 TypeScript 管理 HTML 的小型函式庫（原型）。HTML 描述結構與「資料要放的位置」，TypeScript 負責行為與狀態，DOM 就是唯一的真實呈現。

```html
<!-- user-card.html：HTML 只描述結構、資料要放的位置、事件要找哪個方法 -->
<h2>Hello, {{ name }}!</h2>
<button type="button" data-on-click="rename">改名</button>
<p data-if="admin">管理員</p>
```

```ts
import { Component, define } from "nativele";
import tpl from "./user-card.html.js"; // 由 nativele gen 產生，含型別

class UserCard extends Component(tpl, {
  state: { name: "Ada", admin: true }, // 資料只在這裡；{{ name }}、data-if="admin" 自動對應同名欄位
}) {
  rename() {
    this.set({ name: "Grace" }); // 唯一改資料的入口，畫面自動更新
  }
}
define("user-card", UserCard);
```

HTML 用了 `state` 沒有的名稱、`data-on-click` 指向不存在的方法，`tsc` 都會報錯。

## 快速開始

```sh
npm i -D typescript && npm i nativele
npx nativele gen      # 為每個 x.html 產生 x.html.ts（含型別）
npx tsc             # 型別檢查並編譯；不需要 Vite 或其他 bundler
```

下面三個範例都是 `examples/readme/` 裡真實可執行的檔案（有型別檢查、lint 與測試）。

### 範例 1：計數器（state、衍生值、事件、data-if）

HTML 只描述結構、資料放哪裡、事件找哪個方法：

```html
<p>Count: {{ count }} (double: {{ double }})</p>
<button type="button" data-on-click="inc">+1</button>
<button type="button" data-on-click="reset">Reset</button>
<p data-if="big">That is a lot of clicks!</p>
```

TypeScript 擁有資料與行為。`{{ count }}`、`{{ double }}`、`data-if="big"` 自動對應同名的 state 或衍生值，資料只用 `this.set()` 修改：

```ts
import { Component, define } from "nativele";
import tpl from "./counter.html.js";

export class MyCounter extends Component(tpl, {
  state: { count: 0 },
  derive: { double: (s) => s.count * 2, big: (s) => s.count >= 10 },
}) {
  inc(): void {
    this.set((s) => ({ count: s.count + 1 }));
  }
  reset(): void {
    this.set({ count: 0 });
  }
}
define("my-counter", MyCounter);
```

HTML 用了 `state` 與 `derive` 都沒有的名稱、`data-on-click` 指向不存在的方法，`tsc` 都會報錯。

### 範例 2：待辦清單（清單、事件委派、`hit.key`）

```html
<form data-on-submit="add">
  <input data-ref="input" aria-label="New todo" />
  <button type="submit">Add</button>
</form>
<ul>
  <template data-each="items">
    <li>
      <input type="checkbox" data-ref="check" data-on-change="toggle" />
      <span>{{ title }}</span>
      <button type="button" data-on-click="removeItem">Delete</button>
    </li>
  </template>
</ul>
<p>{{ remaining }} left</p>
```

```ts
import { Component, define } from "nativele";
import type { EventHit } from "nativele";
import tpl from "./todo-list.html.js";

interface Item {
  id: number;
  title: string;
  done: boolean;
}

export class TodoList extends Component(tpl, {
  state: { items: [] as Item[] },
  derive: { remaining: (s) => s.items.filter((i) => !i.done).length },
}) {
  #nextId = 1;

  add(e: Event): void {
    e.preventDefault();
    const title = this.refs.input.value.trim();
    this.refs.input.value = "";
    if (title) this.set((s) => ({ items: [...s.items, { id: this.#nextId++, title, done: false }] }));
  }
  toggle(_e: Event, hit: EventHit): void {
    this.set((s) => ({ items: s.items.map((i) => (i.id === hit.key ? { ...i, done: !i.done } : i)) }));
  }
  removeItem(_e: Event, hit: EventHit): void {
    this.set((s) => ({ items: s.items.filter((i) => i.id !== hit.key) }));
  }

  // Automatic binding handles {{ remaining }}; the list is filled here.
  override render(view: { items: Item[] }, changed: ReadonlySet<string>): void {
    if (!changed.has("items")) return;
    this.lists.items.replace(
      view.items,
      (i) => i.id,
      (i, { text, refs }) => {
        text.title = i.title;
        refs.check.checked = i.done;
        refs.check.setAttribute("aria-label", `Done: ${i.title}`);
      },
      { skipUnchanged: true },
    );
  }
}
define("todo-list", TodoList);
```

- `data-each` 的 `<template>` 是清單項目；自動綁定不處理清單，所以清單在 `render` 裡用 `replace` 填入。
- 事件用委派：清單項目內的 `data-on-change`、`data-on-click` 收到的 `hit.key` 就是該項目的 key。
- `{{ remaining }}` 是衍生值，自動更新。

### 範例 3：父子元件（props 往下、事件往上）

子元件只擁有 `props`（由父層給、唯讀），要改值時用 `emit` 請父層處理：

```html
<button type="button" data-on-click="dec">-</button>
<output>{{ value }}</output>
<button type="button" data-on-click="inc">+</button>
```

```ts
import { Component, define, event } from "nativele";
import tpl from "./quantity-input.html.js";

/** A child component: the parent owns the value (a prop); the child only asks for a change through an event. */
export class QuantityInput extends Component(tpl, {
  props: { value: 0, min: 0, max: 10 },
  emits: { "quantity-change": event<{ value: number }>() },
}) {
  dec(): void {
    if (this.props.value > this.props.min) this.emit("quantity-change", { value: this.props.value - 1 });
  }
  inc(): void {
    if (this.props.value < this.props.max) this.emit("quantity-change", { value: this.props.value + 1 });
  }
}
define("quantity-input", QuantityInput);
```

父層在自己的 HTML 裡直接使用子元件的標籤。`nativele gen` 會自動 `import` 子元件，並讓 `this.refs.qty` 有子元件的完整型別：

```html
<quantity-input data-ref="qty" min="1" max="5" data-on-quantity-change="onQuantity"></quantity-input>
<p>Total: {{ total }}</p>
```

```ts
import { Component, define } from "nativele";
import type { EmitEvent } from "nativele";
import type { QuantityInput } from "./quantity-input.js";
import tpl from "./order-line.html.js";

export class OrderLine extends Component(tpl, {
  state: { quantity: 1, price: 20 },
  derive: { total: (s) => s.quantity * s.price },
}) {
  // Event up: the child asked for a new quantity; the parent decides.
  onQuantity(e: Event): void {
    this.set({ quantity: (e as EmitEvent<QuantityInput, "quantity-change">).detail.value });
  }

  // Data down: the child's props are typed (a wrong name or type is a tsc error).
  override render(view: { quantity: number }): void {
    this.refs.qty.value = view.quantity;
  }
}
define("order-line", OrderLine);
```

資料流只有一個方向：父層的 state → 子元件的 props（`this.refs.qty.value = ...`）；子元件的請求 → 事件 → 父層的處理方法。

## 設計原則

- HTML 是唯一的結構描述來源。
- TypeScript 是唯一的行為與狀態來源。
- DOM 是唯一的 UI 真實呈現，沒有虛擬樹。
- 更新是明確的局部 DOM 操作，沒有全樹 diff。
- 元件生命週期沿用 Custom Elements。
- 狀態訂閱只在你呼叫 `bind` 的地方存在。
- 沒有模板語言：HTML 裡只放**名稱**，不放表達式。
- 型別安全：名稱由 codegen 推導，tsc 與 lint 能檢查 HTML 與 TS 是否對得上。

和 Vue 模板的對照：

| Vue | nativele | 差異 |
|---|---|---|
| `{{ expr }}` | `{{ name }}` | 只能是單一識別字，不能是路徑或運算 |
| `v-if` | `data-if="name"` | 條件由 TS 呼叫 `show(name, bool)` 決定 |
| `v-for` | `<template data-each="name">` | 清單由 TS 呼叫 `replace` 等方法更新 |
| `<slot>` | `<slot name>` | 預設 Light 由函式庫搬移；`shadow: true` 用原生 slot |
| `<style scoped>` | `<style scoped>` | 以原生 `@scope` 實作；沒寫 `scoped` 就是全域 |
| `<template>` | HTML 檔本身 | 一個 `.html` 檔就是一個元件範本 |

## 安裝與設定

只需要 TypeScript，**不需要 Vite 或任何 bundler**：

```sh
npm i -D typescript
npm i nativele
```

`tsconfig.json`（與一般 TS 專案相同，沒有特殊選項）：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "rootDir": "src",
    "outDir": "out"
  }
}
```

流程：先產生範本模組，再用 `tsc` 編譯與型別檢查。

```sh
npx nativele gen        # 為 src/ 下每個 x.html 產生 x.html.ts
npx tsc               # 型別檢查並編譯到 out/
```

文字中的空白預設照原樣保留。若想把連續空白收成一個空格、並丟掉標籤之間只含換行的文字（讓縮排的 HTML 不產生多餘空格），用 `npx nativele gen --whitespace=collapse` 或 Vite 外掛選項 `whitespace: "collapse"`；`<pre>` 與 `<textarea>` 不受影響。

只想產生部分範本時（例如分階段遷移專案），傳入相對於各目錄的 glob：`npx nativele gen src --include='new/**' --exclude='**/draft-*.html'`，或用 Vite 外掛選項 `include`、`exclude`。`*` 只比對同一層資料夾，`**` 可跨資料夾。

開發時可用 `npx nativele gen --watch` 持續監看 `.html`，搭配 `tsc --watch`。

在程式中以 `.js` 結尾匯入範本（標準 NodeNext 寫法，TS 會對應到產生的 `x.html.ts`）：

```ts
import tpl from "./user-card.html.js";
```

### 在瀏覽器執行（不用 bundler）

編譯後的 JS 是標準 ES module，只有一個裸模組名 `nativele` 需要對應，用 import map 即可：

```html
<script type="importmap">
  { "imports": { "nativele": "/node_modules/nativele/dist/index.mjs" } }
</script>
<user-card></user-card>
<script type="module" src="/out/main.js"></script>
```

這個流程（只裝 `typescript`、不裝 Vite，從 `gen` 到真實瀏覽器執行）有自動化驗證：`npm run smoke:no-bundler`。

### 搭配 Vite（選用）

用 bundler 時不需要 import map，`nativele/vite` 外掛只是方便：建置時自動產生 `.html.ts`、dev 時監看 `.html` 重新產生、可選的 ARIA 警告。

```ts
import { defineConfig } from "vite-plus"; // 或 "vite"
import { nativele } from "nativele/vite";

export default defineConfig({
  plugins: [nativele()], // 選項：dirs（預設 ["src"]）、runtime、whitespace、include、exclude、a11y
});
```

安裝時建議先裝 `vite-plus`，再裝 `nativele`（npm 同一次安裝時可能不會把 `vite` 提升到頂層）。

### Lint（選用）

```ts
// vite.config.ts 的 lint 設定（vp lint / oxlint）
lint: {
  ignorePatterns: ["node_modules", "dist", "**/*.html.ts"],
  jsPlugins: [{ name: "nativele", specifier: "nativele/oxlint" }],
  rules: {
    "nativele/unused-markup": "error",
    "nativele/a11y": ["warn", { ignore: [] }], // 選用：ARIA 檢查，見「ARIA / 無障礙檢查」
    "nativele/data-flow": ["warn", { ignore: [] }], // 選用：避免 prop 與事件逐層傳遞，見「資料流」
  },
},
```

不用 oxlint 時，同樣的檢查可用 CLI：

```sh
npx nativele lint [dirs...]   # 未使用標記（錯誤）與資料流建議（警告）
npx nativele lint --a11y      # 另外檢查 ARIA / 無障礙（警告）
npx nativele lint --strict    # 警告也使結束碼為 1（錯誤一定會）
npx nativele lint --json      # 輸出 JSON：{ "issues": [{ file, line, col, severity, rule, message }] }
npx nativele rules            # 列出所有規則代號與說明
```

每則訊息的格式都一樣，說明**哪裡錯、為什麼、怎麼修**，並附上 HTML 裡的行與欄：

```
a.html:2:1 error [unused-ref] data-ref="dead" is never used by the component class. Fix: use this.refs.dead, or remove the attribute if the element needs no TypeScript access.
a.html:3:1 warning [unknown-prop] <x-kid lable> is not a declared prop of <x-kid>. Declared props: label, count. Did you mean "label"? Fix: declare "lable" in the child's props option, or remove the attribute.
```

結束碼：0 = 沒有問題，1 = 有錯誤（或使用 `--strict` 時有警告）。oxlint 外掛的訊息以 `./x.html.js:行:欄 [規則代號] 訊息` 開頭，回報在 `import` 那一行。

建議的檢查流程：`nativele gen && tsc && nativele lint`。

## 型別如何產生

每個 `x.html` 旁會產生 `x.html.ts`（已加入 `.gitignore`；另外會產生 `nativele-tags.ts`，見「組合」），它是一個真正的 TS 模組：同時包含這個範本解析後的標記（以資料表示，執行期用 DOM 呼叫轉成節點，瀏覽器不需要解析 HTML 字串）與結構描述，所以 `tsc` 直接就能編譯與檢查。

```ts
// user-card.html.ts（自動產生）
import { template } from "nativele";
import type { El } from "nativele";
export default template<{
  refs: { "toggle": El<"button"> };
  lists: { "tags": { refs: {}; text: "label"; ifs: "hot" } };
  ifs: "admin";
  slots: "extra";
  text: "name";
}>([["h2", {}, ["Hello, {{ name }}!"]], /* ... */]);
```

整頁文件（以 `<!doctype>` 或 `<html>` 開頭，例如 `index.html`）是頁面入口，不是範本，不會被處理。

## HTML 語法

只有幾種標記，加上一種洞。

| 標記 | 意義 | TS 端 |
|---|---|---|
| `data-ref="name"` | 取得該元素，型別依標籤推導 | `this.refs.name` |
| `data-if="name"` | 條件區塊，**預設隱藏**（從 DOM 移除），TS 說顯示才顯示 | `this.show("name", bool)` |
| `<template data-each="name">` | 清單，內容必須恰好一個根元素 | `this.lists.name` |
| `<slot name="x">` | 插槽 | 使用者提供 `slot="x"` 的子節點 |
| `{{ name }}` | 文字洞，同名可出現多處 | `this.text.name = value`，或由 `state` 自動綁定 |
| `data-on-click="method"` | 事件：呼叫元件的同名方法（事件名稱要小寫） | `method(e, hit)`，見「事件」 |

洞的規則：

- 只能是單一識別字。`{{ data.name }}`、`{{ a + 1 }}` 會在 codegen 時報錯。
- 只用於文字節點，屬性內不支援（`title="{{ x }}"` 會報錯）。需要時用 `data-ref` 取元素再在 TS 設定。
- `<style>`、`<script>` 內的內容不會被當成洞。
- 值為 `null`、`undefined`、`false` 時顯示為空字串。

## 元件

```ts
class MyEl extends Component(tpl) {}                    // 預設：Light DOM
class Iso extends Component(tpl, { shadow: true }) {}   // 選用：Shadow DOM
```

提供的成員：

| 成員 | 說明 |
|---|---|
| `refs` | `data-ref` 對應的元素 |
| `text` | 洞，賦值即更新所有出現位置 |
| `lists` | 清單物件 |
| `show(name, on)` | 切換 `data-if`（預設隱藏） |
| `props` / `emit(name, detail)` | 使用 `props`、`emits` 選項時：父層給的資料（唯讀）與往上發出的事件，見「資料流」 |
| `slotchange(name)` | 覆寫以回應 Light 模式 slot 內容的後續變動 |
| `assignedNodes(name)` | 目前分配到該 slot 的節點（不含後備內容），Light 與 Shadow 行為一致 |
| `bind(store, fn)` | 訂閱 store，立即呼叫一次，元素移除時自動取消 |
| `on(target, type, fn)` | 綁定原生事件，元素移除時自動解除；回傳手動解除用的函式。事件型別與參數依 `HTMLElementEventMap` 推導 |
| `onCleanup(fn)` | 註冊元素移除時執行的清理函式 |
| `root` | 元素本身（預設），或 `ShadowRoot`（`shadow: true`） |
| `connected()` / `disconnected()` | 覆寫以掛上你的行為 |

生命週期就是 Custom Elements 的 `connectedCallback` / `disconnectedCallback`，你也可以直接覆寫它們（記得呼叫 `super`）。

### Light（預設）與 Shadow

nativele 不做樣式管理，所以預設渲染到元素本身（Light DOM）：DOM 裡看到的就是你寫的結構，CSS 是全域的，表單與 ARIA 的 id 參照都照常運作。`shadow: true` 則使用 Shadow DOM。

| | Light（預設） | `shadow: true` |
|---|---|---|
| 渲染位置 | 元素本身 | 元素的 open shadow root |
| 樣式 | 全域；`<style scoped>` 可局部 | 原生隔離：文件的樣式進不來，元件的 `<style>` 出不去；`:host` 有效 |
| `<style>` | 抽出並只注入 `document.head` 一次 | 留在 shadow root 內，不注入 `<head>`；`scoped` 屬性沒有作用 |
| `<slot>` | 建立時一次性搬移，之後由 `MutationObserver` 維持 | 瀏覽器原生 |
| slot 變動通知 | 覆寫 `slotchange(name)` | **原生 `slotchange` 事件**（`slot.addEventListener("slotchange", …)`）；`slotchange(name)` 方法只在 Light 模式呼叫 |
| `assignedNodes(name)` | 有 | 有（等同原生 `slot.assignedNodes()`） |
| `state`、`props`、`derive`、`emit`、`data-on-*`、清單、`data-if`、屬性 | 都支援 | 都支援，行為相同 |
| 表單 | 與外層表單自然相容 | 需自行處理 `ElementInternals` |

Shadow DOM 已在真實 Chrome 驗證（[browser/shadow.test.ts](browser/shadow.test.ts)，18 個測試），涵蓋：渲染與樣式隔離、`:host`、原生 slot 與 `slotchange`、屬性與 props（含升級前賦值）、`state` / `derive` / `data-if`、事件委派（含不冒泡的 `focus`）、`emit` 不冒泡到 `window`、清單項目內的子元件（`hit.key`）、**Shadow 父元件含 Light 子元件、Light 父元件含 Shadow 子元件**，以及使用者放進 slot 的內容不會被當成元件自己的 `data-on-*`。

Light 模式的 slot 規則：

- 依 `slot="name"` 比對，沒有 slot 屬性的進預設 slot，沒有內容時使用 `<slot>` 內的後備內容。
- 使用者內容裡的 `{{ }}`、`data-ref`、`data-if` 不會被解析，它們屬於使用者自己的 DOM。
- 與原生 Shadow DOM 相同，只有**宿主元素的直接子節點**會被分配（巢在更深層的節點不會）。建立後直接加到元素上的子節點會被分配到對應 slot；已分配的節點被改了 `slot` 屬性時會立即重新分配；已分配的節點被移除時，若該 slot 空了就恢復後備內容；沒有對應 slot 的節點與原生行為一致，不呈現。這些變動會呼叫 `slotchange(name)`（建立時的初次分配不會）。
- 動態變動靠 `MutationObserver`，在元素連接期間才觀察，移除時斷開。

```ts
class Card extends Component(tpl) {
  override slotchange(name: "head" | "") { console.log("slot changed", name); }
}
```

### 樣式

範本頂層的 `<style>` 在 Light 模式有兩種寫法：

```html
<style>
  user-card .tag { color: gray }   /* 全域：整份文件共用 */
</style>
<style scoped>
  :scope { display: block }        /* 局部：只作用在 <user-card> 之內 */
  .tag { color: gray }
</style>
```

- `<style>` **必須在 HTML 的第一層**，不可被其他元素（含 `<template data-each>`、`data-if` 元素）包覆，否則 codegen 報錯。
- 兩者都只會注入一次到 `document.head`，不會隨實例重複。
- `scoped` 在支援的瀏覽器用原生 CSS `@scope (<標籤名>)`；不支援時自動退回 CSS nesting（`<標籤名> { ... }`，`:scope` 轉成 `&`），兩者都不需要 CSS 解析器。`@scope` 的優先權以「離根最近」為準，不是只看特異性。
- Light 模式下 `:host` 不會生效，執行時會在 console 警告；請改用標籤選擇器或 `:scope`。
- `shadow: true` 時 `<style>` 保留在 shadow root 內，`scoped` 屬性沒有作用。

## 資料與畫面：state（選用）

最簡單的用法：給 `Component` 一個 `state`，改資料只用 `this.set()`。

```ts
class Counter extends Component(tpl, {
  state: { title: "Todo", items: [] as Item[], filter: "all" },
  derive: { remaining: (s) => s.items.filter((i) => !i.done).length }, // 衍生值
}) {
  add(e: Event) {
    this.set((s) => ({ items: [...s.items, { id: nextId++, title: "x", done: false }] }));
  }
  override render(view, changed) {
    // 自動綁定處理不了的部分（清單、屬性、焦點…）寫在這裡
    if (changed.has("items")) this.lists.items.replace(view.items, (i) => i.id, (i, { text }) => (text.title = i.title));
  }
}
```

| 成員 | 說明 |
|---|---|
| `state` | 目前的資料，唯讀。要改資料請用 `set` |
| `set(patch)` / `set(s => patch)` | **唯一改資料的入口**：淺合併 patch；**沒有任何欄位實際變動（`Object.is`）時什麼都不做**，不會呼叫 `render`。有變動時同步更新自動綁定，再呼叫 `render` |
| `render(view, changed)` | 覆寫它處理自動綁定以外的更新。`view` 是 `state` 加上衍生值，`changed` 是這次有變動的 state 欄位（首次渲染時為全部）。用 `changed.has("x")` 就能略過沒變的部分 |
| `batch(fn)` | 合併多次 `set`：`fn` 結束後只更新一次、呼叫一次 `render` |
| `derive` 選項 | 衍生值，可直接被 `{{ }}`、`data-if` 與 `render` 使用。每次 state 有變動後重新計算，**沒有依賴追蹤** |

**自動綁定**：`{{ name }}` 與 `data-if="admin"` 會對應到同名的 state 欄位（或衍生值），欄位值變動時自動寫入；`data-if` 依真假值顯示。**名稱由 tsc 檢查**：HTML 用了 `state`、`derive` 都沒有的名稱時，`class X extends Component(...)` 會報錯並列出缺少的名稱（錯誤訊息是 `missingStateKeys: "名稱"`）。清單（`data-each`）不自動綁定，因為 key 與每項怎麼填要由你決定，請在 `render` 裡用 `replace`。

設計上的取捨：

- **同步**：`set` 結束時畫面已更新，不做隱式的非同步合併，所以 `set` 之後立刻讀 DOM 一定是新的。需要合併請明確用 `batch`。
- **沒有細粒度更新**：每次有變動就整體重跑一次 `render`，成本取決於你在裡面寫了什麼。大清單請用 `changed` 略過不必要的重繪，並對 `replace` 開 `skipUnchanged`（見「清單」）。
- `render` 內可以呼叫 `set`，會在當次結束後再處理一輪；連續 50 輪還沒穩定會丟出「疑似無限迴圈」錯誤。
- 不使用 `state` 時，原本的 `refs`、`text`、`show`、`bind`、`createStore` 照常可用，完全向下相容。

## 事件：data-on-*

HTML 只寫事件名稱與方法名稱，邏輯在 TS：

```html
<form data-on-submit="add">…</form>
<template data-each="items"><li><button data-on-click="removeItem">✕</button></li></template>
```

```ts
add(e: Event) { e.preventDefault(); … }
removeItem(e: Event, hit: EventHit) { this.set((s) => ({ items: s.items.filter((i) => i.id !== hit.key) })); }
```

- 方法收到 `(event, hit)`。`hit.el` 是帶有 `data-on-*` 的元素；事件發生在清單項目內時，`hit.key` 是該項目的 key，`hit.item` 是最近一次傳給 `update` 的資料；放在項目內的子元件發出的事件也一樣。`hit.item` 預設是 `unknown`，要有型別就在處理方法上標註，例如 `hit: EventHit<Todo>`。需要額外參數就放 `data-*` 屬性，在方法中讀 `hit.el.dataset`。
- **事件委派**：每種事件只在元件根節點掛一個監聽器，清單再長也不會增加監聽器數量，項目增減不需要重新綁定。不冒泡的事件（`focus`、`blur`、`mouseenter` 等）改用捕獲階段，只處理 target 本身；冒泡事件會依序呼叫由內而外的處理方法，`stopPropagation()` 會停止。
- **只認元件自己範本裡的元素**：使用者放進 slot 的內容就算寫了 `data-on-click` 也不會觸發。
- 只能寫方法名稱，`add(1)`、`a.b` 會在 codegen 時報錯；方法名稱不可與 DOM 內建方法或 nativele 成員衝突（例如 `remove`、`click`、`focus`、`set`、`render`），否則會覆蓋它們，codegen 會報錯並建議改名。
- **tsc 檢查方法存在**：`define(name, Class)` 會檢查 HTML 引用的方法都是類別的 public 成員，缺少時報錯並列出名稱（`missingHandlers: "名稱"`）。連接到頁面時也會再檢查一次，丟出明確的執行期錯誤。
- 事件名稱要小寫（HTML 屬性不分大小寫）；`DOMContentLoaded` 這類大小寫混合的事件請改用 `this.on()`。

## 組合：多個元件一起用

每個 `.html` 加上它的 TS 就是一個元件（自訂元素），在別的範本裡直接寫標籤就是組合：

```html
<!-- signup-form.html -->
<form-field data-ref="name" label="姓名" data-on-field-input="onName"></form-field>
<template data-each="entries">
  <li><entry-row data-ref="row" data-on-remove-entry="removeEntry"></entry-row></li>
</template>
```

```ts
render(v) {
  this.refs.name.value = v.name;          // 資料往下：子元件的 props，有完整型別
  this.lists.entries.replace(v.entries, (x) => x.id, (x, { refs }) => { refs.row.name = x.name; });
}
onName(e: Event) {                         // 事件往上：只送到這個標籤的直接父層
  this.set({ name: (e as EmitEvent<FormField, "field-input">).detail.value });
}
```

組合需要三件事，nativele 都處理好了：

- **自動載入子元件**：範本用到的標籤（名稱含連字號），若在掃描目錄內有 `define("tag", Class)`，`nativele gen` 會在產生的 `x.html.ts` 裡自動加上 `import "./child.js"`。HTML 是唯一的依賴來源，不需要自己 `import` 子元件（只用 `import type` 引用型別並不會註冊元素，這是很容易踩到的坑）。目錄之外或第三方的元件，仍需自己 import。
- **子元件的型別**：`nativele gen` 掃描 `define("tag", Class)`（類別要 `export`），產生 `nativele-tags.ts`，把元件登錄到 `HTMLElementTagNameMap`。於是範本裡 `<form-field data-ref="name">` 的 `refs.name` 就是 `FormField`：props 的名稱與型別、方法都由 tsc 檢查。這個檔案已加入 `.gitignore`，與 `.html.ts` 一樣由 `gen` 產生。
- **slot 可以跨層**：父層放進子元件 slot 的內容，其 `{{ }}` 屬於父層，由父層更新；`data-on-*` 也由父層處理，子元件不會誤接。

沒有提供「範本片段 include」：那會變成模板語言的功能。要共用一段結構，請把它做成元件。

## 資料流：props 往下、事件往上

`props`、`emits` 是 `state` 之外的兩個選項，讓父子元件之間的資料流有明確的規則：

```ts
class FormField extends Component(tpl, {
  props: { label: "", value: "", error: "" },      // 父層給的（唯讀）
  state: { touched: false },                       // 自己擁有的
  derive: { showError: (s) => s.touched && s.error !== "" },
  emits: { "field-input": event<{ value: string }>() },   // 會往上發出的事件
}) {
  onInput() {
    this.set({ touched: true });
    this.emit("field-input", { value: this.refs.input.value });
  }
}
```

| | 擁有者 | 誰能改 | 如何改 |
|---|---|---|---|
| `state` | 元件自己 | 元件自己 | `this.set()` |
| `props` | 父層 | 父層 | HTML 屬性（`user-name="Ada"`）或 JS 屬性（`el.userName = "Ada"`） |
| 事件 | 元件自己發出 | 任何人訂閱 | `this.emit(name, detail)` |

- `props` 的預設值決定型別與屬性的轉換：`string`、`number`（無效的數字會警告並用預設值）、`boolean`（屬性存在即 `true`，`"false"` 與移除為 `false`）。陣列與物件只能用 JS 屬性傳入。camelCase 的名稱對應 kebab-case 屬性：`maxLength` ↔ `max-length`。
- `props` 與 `state`、`derive` 一樣可被 `{{ }}`、`data-if` 自動綁定，也出現在 `render` 的 `view` 與 `changed` 裡；元素在升級前就被賦值的 prop 也不會遺失。
- `emits` 的事件預設**不冒泡**，只有子元件那個標籤本身收得到：處理位置一定寫在父層 HTML 的 `<child data-on-xxx="method">` 上，從 HTML 就能看出資料往哪走。需要冒泡才明確宣告 `event({ bubbles: true })`。
- 事件的資料型別由 `EmitEvent<FormField, "field-input">` 取得（`CustomEvent<{ value: string }>`）。

### 型別與執行期的防線

| 問題 | 防範 |
|---|---|
| 在元件內用 `set()` 修改 prop | `set` 的型別不含 props；執行期丟出明確錯誤 |
| `emit` 未宣告的事件、資料型別錯誤、該帶資料卻沒帶 | tsc 報錯；執行期未宣告的事件丟出錯誤 |
| `state` / `props` / `derive` 同名 | tsc 報錯（`conflictingKeys`）；`Component()` 呼叫時丟出錯誤 |
| prop 名稱與 `HTMLElement` 或 nativele 成員同名（`title`、`hidden`、`render`…） | tsc 報錯（`reservedPropNames`）；執行期丟出錯誤 |
| `emits` 與原生事件同名（`click`、`input`…） | tsc 報錯（`nativeEventNames`）；執行期丟出錯誤 |
| 父層給子元件的 prop 名稱或型別錯誤 | tsc 報錯（由 `HTMLElementTagNameMap` 提供型別） |

### 避免層層傳遞（lint：`nativele/data-flow`）

Vue 常見的問題是逐層重新 emit、逐層往下傳 prop，靠習慣維持。這裡除了「事件預設不冒泡」之外，還有 lint 提示（只是建議，不是錯誤）：

| 代號 | 偵測 |
|---|---|
| `prop-forwarding` | 把自己的 prop 原樣賦給子元件（`this.refs.kid.name = v.name`，其中 `name` 是自己的 prop） |
| `emit-forwarding` | 處理子元件事件的方法只是把事件再 `emit` 一次（同名，或整個方法只有一個 `this.emit(...)`） |
| `props-mutation` | 在元件內對 props 賦值（`this.count = …`） |
| `custom-event-on-native` | 把自訂事件寫在原生元素的 `data-on-*` 上（子元件的事件不冒泡，這樣收不到） |
| `unknown-prop` | 寫在子元件標籤上的屬性不是它宣告的 prop（會提示「你是不是想打…」） |
| `invalid-prop-value` | 屬性無法設定該 prop：prop 不是 string / number / boolean（只能用 JS 屬性傳入） |
| `unknown-event` | `data-on-xxx` 寫在子元件標籤上，但子元件沒有宣告（`emits`）這個事件，也不是原生事件 |

最後三項是 **HTML 層級的 props / emit 檢查**：`tsc` 檢查 TypeScript 裡的 `refs.child.prop` 與 `emit()`，這三條則檢查寫在**父層 HTML** 裡的子元件屬性與事件。它們會讀取目錄內 `define("tag", Class)` 的子元件，從 `Component(tpl, { props, emits })` 取出宣告；找不到子元件定義時（例如第三方元件）不會檢查。


建議的做法：

- **資料與事件只跨一層**：父層擁有資料，往下傳 props，子元件用事件通知。
- **跨多層共享的資料用共享 store**：把 `createStore` 放在獨立模組，需要的元件直接 import 並用 `this.bind(store, fn)` 訂閱，中間層不必知道、也不必轉傳。
- 事件要跨兩層時，請在中間層明確處理它（它有自己的邏輯），而不是原樣轉發。

```ts
// session.ts —— 任何深度的元件都能直接用，不用逐層傳
export const session = createStore({ user: "Ada" });
// 深層元件
connected() { this.bind(session, (s) => (this.text.user = s.user)); }
```

開啟方式與其他 lint 相同：`"nativele/data-flow": ["warn", { ignore: [] }]`，或 CLI `npx nativele lint`（會一併顯示資料流警告，加 `--strict` 則使結束碼為 1）。

### 表單輸入的小提醒

在 `render` 裡把資料寫回 `<input>` 時，請先比對值是否相同：資料經「輸入 → emit → 父層 → props」回到子元件時，若重複寫入同樣的值，游標會跳到最後面。

```ts
if (changed.has("value") && this.refs.input.value !== v.value) this.refs.input.value = v.value;
```

範例 [examples/signup](examples/signup/signup-form.ts) 就是這樣做，並有真實 Chrome 測試驗證游標位置不會跳動。

## 效能

量測環境：真實 Chrome（WSL），每項只有一個文字洞，只計腳本執行時間（不含版面與繪製），單次量測，請當成數量級參考。

| 清單大小 | 首次建立 | 資料完全相同 | 只改 1 項 | 反轉順序 |
|---|---|---|---|---|
| 1,000 | 約 11 ms | 約 0.6 ms | 約 0.4 ms | 約 1.3 ms |
| 5,000 | 約 23–34 ms | 約 2 ms | 約 0.9 ms | 約 6–8 ms |
| 10,000 | 約 65 ms | 約 9 ms | 約 2 ms | 約 19 ms |

「資料完全相同」是 `render` 每次都重跑整個清單的成本：文字節點值沒變就不寫，所以很便宜。一個畫面的預算約 16 ms，上萬項再每次按鍵都重跑就會吃緊，請用 `changed` 略過、`skipUnchanged`，或把清單拆小。事件委派不會隨項目數增加監聽器。

## 範例

- [examples/signup](examples/signup/signup-form.ts)：註冊表單。三個元件組合（`signup-form` → `form-field`、`entry-row`），涵蓋 `props` 往下、`emits` 往上、清單內的子元件（`hit.key`）、`derive` 驗證、表單輸入不跳游標；對應的真實 Chrome 測試在 [browser/signup.test.ts](browser/signup.test.ts)。
- [examples/user-card](examples/user-card.ts)：最小範例，涵蓋 `state` 自動綁定、`data-on-click`、清單、slot。
- [examples/todo](examples/todo/todo-app.ts)：完整的待辦清單，涵蓋 `state` 與 `derive`、`data-on-*` 事件委派（含清單項目的 `hit.key`）、篩選、空狀態、`aria-pressed`、`skipUnchanged`；有對應的真實 Chrome 端對端測試（[browser/todo.test.ts](browser/todo.test.ts)）。

## 狀態：store（不使用 state 時）

```ts
const store = createStore({ count: 0 });
store.get();
store.set({ count: 1 });
store.set((s) => ({ count: s.count + 1 }));
const off = store.subscribe((s) => console.log(s)); // 回傳取消函式
```

`this.bind` 也接受只有 `get` 與 `subscribe` 的唯讀來源。沒有依賴追蹤，`set` 後所有訂閱者都會被呼叫；值以 `Object.is` 相同時不通知。它是不使用 `state` 選項時的小工具，你也可以完全不用，自己管理狀態再直接寫入 `refs` / `text`。需要自動綁定與 `render` 時請改用上面的 `state`。

## 不用元件的範本

`tpl.instantiate()` 不需要自訂元素就能建立範本，並回傳與元件相同、有型別的操作介面：`root`（`DocumentFragment`）、`refs`、`lists`、`text`、`show`。適合在程式裡建立的小片段，例如加進清單的選單項目：

```ts
import itemTpl from "./menu-item.html.js";

function menuItem(label: string): HTMLElement {
  const view = itemTpl.instantiate();
  view.text.label = label;
  view.refs.button.addEventListener("click", () => select(label));
  return view.root.firstElementChild as HTMLElement;
}
```

這種用法沒有宿主元素，所以 `data-on-*` 不會生效（請在 `refs` 上自行監聽），`<slot>` 也不會投影；需要這些時請用元件。

## 清單

```html
<ul>
  <template data-each="tags">
    <li><span>{{ label }}</span> <b data-if="hot">🔥</b></li>
  </template>
</ul>
```

```ts
this.lists.tags.replace(
  tags,
  (t) => t.id, // key
  (t, { text, refs, show, el }) => {
    text.label = t.label;
    show("hot", t.hot === true);
  },
);
```

| 方法 | 說明 |
|---|---|
| `replace(items, key, update, opts?)` | keyed 對照：刪除多餘、建立缺少、依序重排，並對每項呼叫 `update`。`opts.skipUnchanged: true` 時，項目參照與上次相同就略過 `update`（預設關閉：只在你用不可變更新時才安全，直接修改物件的話畫面會停在舊值） |
| `upsert(key, item, update)` | 新增（放最後）或更新單一項目 |
| `remove(key)` | 移除單一項目 |
| `clear()` | 清空 |
| `has(key)` / `get(key)` / `size` | 查詢 |

`replace` 只做一維的 key 對照，既有項目的 DOM 節點會被保留與移動，不會比對子樹。項目內容完全由你的 `update` 決定。

注意：

- 項目內的 `data-ref`、洞、`data-if` 屬於該項目，不會出現在元件層級的 `refs` / `text`。
- `data-if` 不能放在項目的根元素上，請多包一層。
- `data-each` 不能巢狀，要分成兩套模板：把內層清單放進自己的 `.html`（有自己 `data-each` 的子元件），在外層項目裡使用該元件的標籤。
- `<slot>` 不能放在項目內。

## Trusted Types、翻譯與圖示

- Trusted Types：啟用 `require-trusted-types-for 'script'` 的頁面不需要設定任何 policy 就能用，因為 `nativele gen` 把標記寫成資料，執行期只用 DOM 呼叫建立。你自己的程式碼也要避免 `innerHTML`。
- 翻譯：nativele 不內建 i18n。把翻譯後的字串寫進文字洞，例如 `this.text.title = t("title")`，屬性則在 `render()` 裡處理；HTML 要不要完全不放文字由你決定。
- 圖示：nativele 不管理圖示。把圖示做成你自己的自訂元素，用 `createElementNS` 從你選的來源建立 SVG，在模板裡當子元件使用：

```html
<app-icon name="send" class="size-4"></app-icon>
```

- 重新排序：清單（`data-each`）在瀏覽器支援時用 `moveBefore` 搬動項目，所有元件都接受這種搬動而不會被斷開再連上，所以被搬動的項目保有焦點、捲動位置與訂閱。

## 檢查

四道檢查，互補。**每一則訊息都有穩定的規則代號，並說明哪裡錯、為什麼、怎麼修**；`npx nativele rules` 列出全部規則。

1. **codegen 診斷**（`nativele gen` 與 Vite 外掛，帶行列號，有錯誤時中斷、不寫檔）：重複的 `data-ref`、`data-each` 沒有單一根元素、`data-each` 不在 `<template>` 上、`data-each` 巢狀、`data-if` 在項目根元素、`<slot>` 在項目內、`<style>` 不在第一層、不合法的洞、屬性內的洞、不合法的 `data-on-*`（含與 DOM 或 nativele 成員同名），以及會執行程式碼或被 Trusted Types 擋下的標記：`<script>`、`on*` 屬性、`srcdoc`、`javascript:` 網址。
2. **tsc**：TypeScript 使用了 HTML 沒有宣告的名稱就報錯（`this.refs.nope`、`this.show("nope", true)`）；`state`、`props`、`derive`、`emits` 與 HTML 之間的所有約束（見「資料流」）；子元件 prop 的名稱與型別；`define()` 檢查 `data-on-*` 的方法存在。
3. **執行期**：`Component()` 與元件在定義、連接與使用時，對同樣的問題丟出帶 `[規則代號]` 與修正方式的錯誤。
4. **lint**（`nativele/unused-markup`、`nativele/data-flow`、`nativele/a11y`）：HTML 宣告了卻沒被使用的標記（錯誤，附 HTML 位置）、資料流建議與子元件契約（警告）、ARIA（警告）。

`unused-markup` 的規則：

| 代號 | 偵測 |
|---|---|
| `unused-ref` | `data-ref` 沒被元件使用 |
| `unused-if` | `data-if` 沒被切換（`data-if` 預設隱藏，所以內容永遠不會出現） |
| `unused-text` | `{{ 洞 }}` 沒被填入，會顯示空白 |
| `unused-list` | `data-each` 沒被渲染，清單永遠是空的 |
| `unused-item-name` | 清單項目內的名稱沒被引用 |
| `missing-handler` | `data-on-*` 引用的方法，類別沒有定義 |
| `no-importer` | 沒有任何 TypeScript 檔匯入這個範本 |

lint 以 `class X extends Component(tpl)` 的**類別本體**為單位比對；使用 `state` / `props` / `derive` 選項時，`{{ }}` 與 `data-if` 由自動綁定處理，不要求在程式中出現，但 `data-on-*` 引用的方法必須存在（若程式用 `refs[k]`、`text[k]`、`lists[k]` 這類動態存取，無法得知用到哪些名稱，會保守地視為全部都有用到），所以同一個檔案匯入多個範本也不會互相蓋掉：

```ts
import listTpl from "./list.html.js";   // data-ref="title"
import cardTpl from "./card.html.js";   // data-ref="title"（Card 從未使用）
class List extends Component(listTpl) { connected() { this.refs.title.hidden = true } }
class Card extends Component(cardTpl) {}   // → 回報 card.html 的 title 未被使用
```

注意：refs、text 等應由元件自己的 class 使用。在 class 外部透過實例存取（例如測試）不會被計入，測試目錄請關閉這條規則。找不到對應 class（例如用 helper 包裝 `Component`）時，退回整份檔案比對。

## ARIA / 無障礙檢查

預設**關閉**。開啟後，會對範本中建議加上 ARIA 或標籤的地方產生**警告**（不是錯誤）。有三種開法，共用同一份檢查：

```ts
// 1. lint：編輯器與 vp lint 都會顯示，警告回報在 import 那一行（訊息內含 html 的行列號）
lint: { rules: { "nativele/a11y": ["warn", { ignore: ["img-alt"] }] } }

// 2. 建置：dev / build 時在終端機顯示
plugins: [nativele({ a11y: true })]            // 或 { a11y: { ignore: ["img-alt"] } }
```

```sh
# 3. CLI
npx nativele lint --a11y [--strict]
```

`ignore` 填規則代號，可關閉個別檢查：

| 代號 | 檢查 |
|---|---|
| `img-alt` | `<img>` 需要 `alt`（裝飾性圖片用 `alt=""`） |
| `control-name` | `<button>`、`<a href>`、`<summary>` 需要可讀名稱（文字、`{{ }}`、`<slot>`、`aria-label` 或 `aria-labelledby`） |
| `form-label` | `<input>`、`<select>`、`<textarea>` 需要 `<label for>`、被 `<label>` 包住，或 `aria-label` |
| `iframe-title` | `<iframe>` 需要 `title` |
| `dialog-name` | `<dialog>` 需要 `aria-label` 或 `aria-labelledby` |
| `heading-empty` | `h1`–`h6` 不可為空 |
| `aria-role` | `role` 必須是有效的 ARIA 角色 |
| `aria-attr` | `aria-*` 必須是有效的 ARIA 屬性 |
| `role-tabindex` | 非原生可聚焦元素若有互動 role（button、tab、checkbox…），需要 `tabindex` |
| `tabindex-positive` | 不要使用大於 0 的 `tabindex` |
| `hidden-focusable` | 可聚焦元素不可設 `aria-hidden="true"` |
| `label-for` | `<label for>` 必須指向範本內存在的 `id` |
| `id-in-list` | `data-each` 項目內的 `id` 會隨項目重複，請改用 `data-ref` 或 class |
| `duplicate-id` | `id` 在範本內不可重複 |
| `aria-idref` | `aria-labelledby`、`describedby`、`controls`、`owns` 等參照的 id 必須存在於範本內（指向範本外的元素時可用 `ignore` 關閉） |
| `heading-order` | 標題層級不可跳級（`h1` 後直接 `h3`），以範本內的文件順序判斷 |
| `table-header` | `<table>` 需要 `<th>`；版面用表格請設 `role="presentation"` |
| `list-structure` | `<ul>`/`<ol>` 的子元素（含 `data-each` 項目的根元素）必須是 `<li>`；`<li>` 必須在 `<ul>`、`<ol>`、`<menu>` 內 |
| `landmark-label` | 同一個範本內有多個 `<nav>` 或 `<aside>` 時，需要用 `aria-label` 區分 |
| `redundant-role` | `role` 與元素原本的語意相同，例如 `<button role="button">` |
| `click-semantics` | `data-on-click` 應放在可操作的元素上（`button`、`a[href]`、`label`，或有互動 role 加 `tabindex`），否則鍵盤與輔助技術無法使用 |

為了避免大量誤報，有 `data-ref` 的元素視為「由 TS 管理」，會略過 `img-alt`、`control-name`、`form-label`、`iframe-title`、`dialog-name`、`heading-empty`、`role-tabindex`、`table-header`、`landmark-label`、`aria-idref` 這些「名稱或參照可能在 TS 設定」的檢查。

這是靜態檢查，只看 HTML 範本：不會分析 TS 在執行時加上的屬性，也不涵蓋色彩對比、焦點管理、鍵盤互動等需要實際渲染才能判斷的項目，不能取代 axe 之類的工具與人工測試。

## 專案結構

```
src/lib/
  component.ts      Component 基底類別、define
  list.ts           keyed 清單
  cond.ts           data-if
  text.ts           {{ }} 洞
  slots.ts          Light DOM 的 slot
  style.ts          Light 模式的樣式注入、scoped
  store.ts          createStore
  template.ts       Template / Schema 型別
  codegen.ts        parse5 解析、診斷、產生 .html.ts
  vite-plugin.ts    選用的 Vite 外掛（nativele/vite）
  lint.ts           未使用標記與資料流檢查
  reserved.ts       保留名稱（與 DOM、nativele 成員衝突）
  llms.txt          給 AI agent 的精簡參考（隨套件發佈）
  a11y.ts           ARIA / 無障礙檢查
  oxlint-plugin.ts  oxlint JS 外掛（nativele/oxlint）
src/cli.ts          nativele gen / lint
examples/           user-card 與待辦清單（todo）範例，demo 入口
test/               單元測試（happy-dom）
browser/            真實 Chrome 測試與 fixture
```

## 開發本專案

| 指令 | 說明 |
|---|---|
| `npm run dev` | 啟動 demo（`vp dev`） |
| `npm run build` | 建置 demo 到 `demo-dist/` |
| `npm run build:lib` | 建置函式庫到 `dist/` |
| `npm run smoke` | 打包後在裝了 Vite 的全新專案驗證 `gen → tsc → lint → build` |
| `npm run smoke:no-bundler` | 打包後在**只裝 typescript** 的全新專案驗證 `gen → tsc → 瀏覽器執行` |
| `npm run verify:pack` | 建置並以 `publint`、`attw` 檢查發佈設定（`npm pack` 前會自動執行） |
| `npm run gen` | 產生範例與測試的 `.html.ts` |
| `npm run check` | `gen` 後執行 `tsc` |
| `npm test` | 單元測試（happy-dom） |
| `npm run test:browser` | 在真實 Chrome 中執行的測試（見下） |
| `npm run lint` | `vp lint`，含 `nativele/unused-markup` |
| `npm run lint:html` | 同一套檢查的 CLI 版本 |

repo 內的範例以 `vite.config.ts` 的 alias 直接指向 `src/lib`，不需先打包。

### 瀏覽器測試

`npm run test:browser` 會啟動 `vp dev`，以 `playwright-core` 驅動系統安裝的 Chrome（不下載瀏覽器），驗證 happy-dom 無法涵蓋的行為：原生 `@scope`、解析器建立元素的 slot 分配、`MutationObserver` 動態 slot、Shadow DOM 的原生 slot 與樣式隔離。

| 環境變數 | 說明 |
|---|---|
| `CHROME_BIN` | Chrome 路徑，預設 `/usr/bin/google-chrome` |
| `NATIVELE_CHROME_HOME` | Chrome 使用的 HOME，預設 `/tmp/chome`（WSL 或唯讀家目錄下避免 crashpad 寫入失敗） |

測試固定使用 `--no-sandbox --no-zygote`，適合 WSL 與容器環境；一般桌面環境也可執行。

預設只跑 Chromium，CI 也只跑 Chromium：這個函式庫是 TS 工具，靠的是 DOM 標準 API，不是瀏覽器之間差異很大的 CSS 渲染。若想在 Firefox 上試跑，可用 `BROWSER=firefox PLAYWRIGHT_BROWSERS_PATH=<路徑> npm run test:browser`（需先 `npx playwright-core install firefox`；Firefox 157 已驗證全數通過）。WebKit 未驗證。

## 設計決定

這些是刻意的取捨，不是缺少的功能：

- **`{{ }}` 只能是單一識別字**：路徑與表達式會讓 HTML 擁有第二份資料形狀，也會滑向模板語言。需要計算請在 TS 完成後填入具名洞。
- **沒有屬性綁定**：用 `data-ref` 取得元素，再在 TS 設定屬性。
- **`<slot>` 不可放在 `data-each` 項目內**：項目會重複，但使用者提供的內容只有一份，原生 Shadow DOM 的語意也是只有第一個同名 slot 會拿到內容。要讓每個項目都有各自的內容，需要 Vue scoped slot 那種「把項目資料傳給插槽」的機制，那會需要表達式。請改在 `update` 回呼中用 TS 填入，或把項目內容做成另一個元件。
- **資料流只有一個方向**：state 自己改、props 由父層改、事件往上；`emit` 預設不冒泡，要跨層就明確處理或用共享 store，不做隱式的跨層傳遞。
- **資料只有一個入口、畫面只有一個地方**（`set` 與 `render`）：「資料怎麼變成畫面」集中在 `render`，要追蹤資料變化只需看 `set` 的呼叫。
- **同步渲染，不做隱式非同步合併**：`set` 之後立刻讀 DOM 一定是新的，測試也不需要等待；要合併請明確用 `batch`。
- **沒有細粒度反應式系統**：`derive` 每次重新計算、`render` 每次整體重跑，換來的是行為可預測、沒有依賴追蹤的魔法。
- **`data-if` 預設隱藏**：狀態只在 TS，沒說要顯示就不顯示。
- **`data-if` 不可放在項目根元素、`data-each` 不可巢狀**：根元素被移除會讓清單失去排序錨點；一套模板只有一層清單，巢狀的清單就是第二套模板（子元件），讓每套模板的 `refs`、`text` 與事件處理都在單一範圍內。

## 限制

- 在瀏覽器直接執行（不用 bundler）時，需自行提供 import map 對應 `nativele`，且相對匯入需寫 `.js` 副檔名（NodeNext 慣例）。
- `data-on-*` 的事件名稱要小寫；不冒泡的事件只處理 target 本身。
- 子元件的自動 import 與標籤型別只掃描 `gen` 指定的目錄；第三方或目錄外的元件要自己 import，也要自己宣告 `HTMLElementTagNameMap`。`define` 的類別沒有 `export` 時不會有標籤型別。
- 事件處理方法收到的 `CustomEvent` 需要用 `EmitEvent<子元件, "事件名">` 轉型，HTML 屬性無法帶型別。
- Shadow 模式下 `slotchange(name)` 方法不會被呼叫，請用原生 `slotchange` 事件。
- `define("tag", Class)` 的掃描是文字比對（會略過字串與註解），不是完整的程式分析；HTML 層級的子元件契約檢查也一樣，只讀得到 `Component(tpl, { props, emits })` 這種字面寫法。
- `props` 只有預設值為 string / number / boolean 時才能用 HTML 屬性傳入。
- 自動綁定只涵蓋文字洞與 `data-if`，清單與屬性要在 `render` 寫。
- 版本 0.x，API 仍可能改動（例如 `Update` 回呼簽章已改過兩次），版本策略見 [CHANGELOG.md](CHANGELOG.md)。
- 沒有 SSR 或 hydration。
- 沒有屬性綁定（刻意不做，請用 `refs`）。
- 未使用標記的 lint 以類別本體文字比對，對清單項目內的名稱較寬鬆（只看識別字）。
- `<style scoped>` 在不支援 `@scope` 的瀏覽器退回 CSS nesting，需要瀏覽器支援 nesting（2023 年起為主流）。
- ARIA 檢查只涵蓋靜態 HTML 的常見項目（見上方清單），不是完整的無障礙稽核。
- 瀏覽器測試以 Chromium 為準；Firefox 157 手動驗證通過，WebKit（Safari）未驗證。
