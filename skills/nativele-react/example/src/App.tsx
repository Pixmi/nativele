import { useState } from "react";
import type { Item } from "./nv/info-card.js";

const fruits: Item[] = [
  { id: 1, name: "apple" },
  { id: 2, name: "pear" },
];

export function App() {
  const [count, setCount] = useState(0);
  const [item, setItem] = useState<Item>(fruits[0] as Item);
  const [picked, setPicked] = useState<number[]>([]);
  const [rows, setRows] = useState(["a", "b", "c"]);
  const [showTitle, setShowTitle] = useState(true);

  return (
    <>
      <info-card id="card" label="Fruit" count={count} item={item} onitem-select={(e) => setPicked((p) => [...p, e.detail.id])} />
      <p id="picked">{picked.join(",")}</p>
      <button type="button" id="next" onClick={() => { setCount((c) => c + 1); setItem(fruits[1] as Item); }}>
        Next
      </button>

      <shadow-card id="shadow">
        {showTitle && <span slot="title">Shadow</span>}
        {rows.map((r) => <p key={r}>{r}</p>)}
      </shadow-card>

      <light-card id="light">
        <div slot="title">{showTitle && <span>Light</span>}</div>
        <div>{rows.map((r) => <p key={r}>{r}</p>)}</div>
      </light-card>

      <button type="button" id="rotate" onClick={() => setRows((r) => [r.at(-1) as string, ...r.slice(0, -1)])}>
        Rotate
      </button>
      <button type="button" id="toggle-b" onClick={() => setRows((r) => (r.includes("b") ? r.filter((x) => x !== "b") : ["b", ...r]))}>
        Toggle b
      </button>
      <button type="button" id="toggle-title" onClick={() => setShowTitle((s) => !s)}>
        Toggle title
      </button>
    </>
  );
}
