import { useState } from "preact/hooks";
import type { Item } from "./nv/info-card.js";
import { ticks } from "./nv/store.js";

const fruits: Item[] = [
  { id: 1, name: "apple" },
  { id: 2, name: "pear" },
];

export function App() {
  const [count, setCount] = useState(0);
  const [item, setItem] = useState<Item>(fruits[0]!);
  const [picked, setPicked] = useState<number[]>([]);
  const [camel, setCamel] = useState(0);
  const [text, setText] = useState("one");
  const [showLate, setShowLate] = useState(false);
  const [rows, setRows] = useState(["a", "b", "c"]);
  const [showTitle, setShowTitle] = useState(true);
  const [showProbe, setShowProbe] = useState(true);

  const rotate = () => setRows((r) => [r.at(-1)!, ...r.slice(0, -1)]);
  const toggleB = () => setRows((r) => (r.includes("b") ? r.filter((x) => x !== "b") : ["b", ...r]));

  return (
    <>
      <nv-info-card id="card" label="Fruit" count={count} item={item} onitem-select={(e) => setPicked((p) => [...p, e.detail.id])} />
      <p id="picked">{picked.join(",")}</p>
      <button type="button" id="next" onClick={() => (setCount((c) => c + 1), setItem(fruits[1]!))}>Next</button>

      <nv-info-card id="camel" item={item} {...{ onItemSelect: () => setCamel((n) => n + 1) }} />
      <p id="camel-count">{camel}</p>

      <nv-text-field id="field" value={text} onvalue-change={(e) => setText(e.detail.value)} />
      <p id="text">{text}</p>
      <button type="button" id="reset" onClick={() => setText("reset")}>Reset</button>

      {showLate && (
        <>
          <nv-late-card id="late-prop" item={item} />
          <nv-late-card id="late-ref" ref={(el) => { if (el) el.item = item; }} />
        </>
      )}
      <button type="button" id="show-late" onClick={() => setShowLate(true)}>Show late</button>
      <button type="button" id="define-late" onClick={() => import("./nv/late-card.js")}>Define late</button>

      <nv-shadow-card id="shadow">
        {showTitle && <span slot="title">Shadow</span>}
        {rows.map((r) => <p key={r}>{r}</p>)}
      </nv-shadow-card>

      <nv-light-card id="light">
        <div slot="title">{showTitle && <span>Light</span>}</div>
        <div>{rows.map((r) => <p key={r}>{r}</p>)}</div>
      </nv-light-card>

      <div id="hosts">
        {rows.map((r) => (
          <nv-light-card key={r} data-key={r}>
            <div>{r}</div>
          </nv-light-card>
        ))}
      </div>

      <button type="button" id="rotate" onClick={rotate}>Rotate</button>
      <button type="button" id="toggle-b" onClick={toggleB}>Toggle b</button>
      <button type="button" id="toggle-title" onClick={() => setShowTitle((s) => !s)}>Toggle title</button>

      <div id="probes">
        {rows.map((r) => <nv-life-probe key={r} name={r} />)}
      </div>
      {showProbe && <nv-life-probe id="cond" name="cond" />}
      <button type="button" id="toggle-probe" onClick={() => setShowProbe((s) => !s)}>Toggle probe</button>
      <button type="button" id="tick" onClick={() => ticks.set((s) => ({ n: s.n + 1 }))}>Tick</button>
    </>
  );
}
