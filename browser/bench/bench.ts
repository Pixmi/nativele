import { Component, define } from "@nativele/ts-dom";
import tpl from "./bench-list.html.js";
import type { Row } from "./bench-row.js";
import "./bench-row.js";

export class BenchList extends Component(tpl) {}
define("bench-list", BenchList);

type Fill = (rows: readonly Row[]) => void;

/** A hand-written keyed list on plain DOM calls: the baseline the library is compared with. */
function directList(ul: HTMLElement): Fill {
  const shown = new Map<number, { li: HTMLLIElement; row: Row }>();
  return (rows) => {
    const keep = new Set(rows.map((r) => r.id));
    for (const [id, { li }] of shown) {
      if (keep.has(id)) continue;
      li.remove();
      shown.delete(id);
    }
    let after: Node | null = null;
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i] as Row;
      let entry = shown.get(row.id);
      if (!entry) {
        entry = { li: document.createElement("li"), row };
        entry.li.textContent = row.label;
        shown.set(row.id, entry);
      } else if (entry.row !== row) {
        entry.row = row;
        if (entry.li.textContent !== row.label) entry.li.textContent = row.label;
      }
      if (entry.li.nextSibling !== after || entry.li.parentNode !== ul) ul.insertBefore(entry.li, after);
      after = entry.li;
    }
  };
}

const makeRows = (n: number, from = 0): Row[] => Array.from({ length: n }, (_, i) => ({ id: from + i, label: `row ${from + i}` }));

const scenarios: [string, (rows: Row[], n: number) => Row[]][] = [
  ["update 10%", (rows) => rows.map((r, i) => (i % 10 === 0 ? { ...r, label: `${r.label}!` } : r))],
  ["reverse", (rows) => [...rows].reverse()],
  ["remove half", (rows) => rows.filter((_, i) => i % 2 === 0)],
  ["append 1,000", (rows, n) => [...rows, ...makeRows(1000, n * 10)]],
];

function time(fill: Fill, rows: readonly Row[]): number {
  const start = performance.now();
  fill(rows);
  return performance.now() - start;
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] as number;

/** Runs every scenario `runs` times on a fresh list and returns the median milliseconds, keyed by approach, size and scenario. */
export function bench(sizes: readonly number[], runs = 5): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  const approaches: [string, (host: BenchList) => Fill][] = [
    ["components (items =)", (h) => (rows) => (h.lists.rows.items = rows)],
    ["plain elements (replace)", (h) => (rows) => h.lists.plain.replace(rows, (r) => r.id, (r, { text }) => (text.label = r.label), { skipUnchanged: true })],
    ["direct DOM (baseline)", (h) => directList(h.refs.direct)],
  ];
  for (const [name, make] of approaches) {
    for (const n of sizes) {
      const results: Record<string, number[]> = { create: [] };
      for (const [label] of scenarios) results[label] = [];
      for (let run = 0; run < runs; run++) {
        for (const [label, change] of [["create", (r: Row[]) => r] as const, ...scenarios]) {
          const host = document.createElement("bench-list") as BenchList;
          document.body.append(host);
          const fill = make(host);
          const rows = makeRows(n);
          if (label === "create") results.create?.push(time(fill, rows));
          else {
            fill(rows);
            results[label]?.push(time(fill, change(rows, n)));
          }
          host.remove();
        }
      }
      out[`${name} | ${n.toLocaleString("en-US")}`] = Object.fromEntries(Object.entries(results).map(([k, v]) => [k, Math.round(median(v) * 10) / 10]));
    }
  }
  return out;
}

Object.assign(window, { bench });
