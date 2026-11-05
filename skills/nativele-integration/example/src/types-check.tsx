import { useRef } from "preact/hooks";
import type { Item } from "./nv/info-card.js";

export function TypesCheck() {
  const item: Item = { id: 1, name: "x" };
  const card = useRef<HTMLElementTagNameMap["nv-info-card"]>(null);
  return (
    <>
      <nv-info-card ref={card} label="x" count={1} item={item} onitem-select={(e) => e.detail.id.toFixed()} onClick={() => card.current?.pick()} />
      {/* @ts-expect-error count is a number */}
      <nv-info-card count="1" />
      {/* @ts-expect-error item has the wrong shape */}
      <nv-info-card item={{ id: "1" }} />
      {/* @ts-expect-error detail is { id: number } */}
      <nv-info-card onitem-select={(e) => e.detail.name} />
      {/* @ts-expect-error labl is not a prop */}
      <nv-info-card labl="x" />
      {/* @ts-expect-error the event is item-select, not ItemSelect */}
      <nv-info-card onItemSelect={() => {}} />
    </>
  );
}
