import type { Item } from "./nv/info-card.js";

const item: Item = { id: 1, name: "x" };

export const ok = <info-card label="x" count={1} item={item} onitem-select={(e) => e.detail.id.toFixed()} />;
// @ts-expect-error: count is a number
export const wrongProp = <info-card count="1" />;
// @ts-expect-error: item has the wrong shape
export const wrongItem = <info-card item={{ id: "1" }} />;
// @ts-expect-error: detail is { id: number }
export const wrongDetail = <info-card onitem-select={(e) => e.detail.name} />;
// @ts-expect-error: not a registered element
export const unknownTag = <info-cards />;
