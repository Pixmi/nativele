import type { Locator, Page } from "playwright-core";

interface TrialBrowser {
  page: Page;
  check: (name: string, ok: boolean, detail?: unknown) => void;
}

type ItemElement = HTMLElement & { item?: { id: number; name: string; qty: number }; lowThreshold?: unknown; trialMark?: number; trialEvents?: unknown[] };

const shows = async (scope: Locator | Page, text: string) => (await scope.getByText(text).filter({ visible: true }).count()) > 0;

export default async function ({ page, check }: TrialBrowser): Promise<void> {
  await page.waitForSelector("nv-inventory-item", { timeout: 15_000 });
  const items = page.locator("nv-inventory-item");
  const byName = (name: string) => items.filter({ hasText: name });
  const names = () => items.evaluateAll((els) => els.map((el) => (el as ItemElement).item?.name));
  const qtyInput = page.locator("nv-qty-input");
  const summary = page.locator("nv-inventory-summary");
  const setQty = async (value: string) => {
    await qtyInput.locator('input[type="number"]').fill(value);
  };

  check("three items in the initial order", JSON.stringify(await names()) === JSON.stringify(["apple", "pear", "plum"]), await names());
  const props = await items.evaluateAll((els) =>
    els.map((el) => ({ item: typeof (el as ItemElement).item, attrs: el.getAttributeNames(), lowThreshold: (el as ItemElement).lowThreshold })),
  );
  check(
    "item and lowThreshold are properties, not attributes",
    props.every((p) => p.item === "object" && p.lowThreshold === 2 && !p.attrs.some((a) => /^(item|low-?threshold)$/i.test(a))),
    props,
  );
  for (const name of ["apple", "pear", "plum"]) check(`the ${name} item shows its name`, await shows(byName(name), name));
  check("low stock shows only while qty < lowThreshold", !(await shows(byName("apple"), "low stock")) && (await shows(byName("pear"), "low stock")) && !(await shows(byName("plum"), "low stock")));
  check("the badge slot shows out of stock only at qty 0", !(await shows(byName("apple"), "out of stock")) && (await shows(byName("pear"), "out of stock")) && !(await shows(byName("plum"), "out of stock")));
  check("nothing is selected at first", (await shows(page, "Selected: none")) && (await shows(page, "Selections: 0")) && (await qtyInput.count()) === 0);
  check("the summary shows the initial total", await shows(summary, "Total: 10"), await summary.allInnerTexts());
  check("the kebab-case Vue component renders", await shows(page, "Inventory footer"));

  await byName("pear").evaluate((el) => {
    const item = el as ItemElement;
    item.trialEvents = [];
    el.addEventListener("item-select", (e) => item.trialEvents?.push((e as CustomEvent).detail));
  });
  await byName("pear").getByRole("button", { name: "Select", exact: true }).click();
  const events = await byName("pear").evaluate((el) => (el as ItemElement).trialEvents);
  check("Select emits item-select once from the item, with detail { id }", JSON.stringify(events) === JSON.stringify([{ id: 2 }]), events);
  check("the page shows the selection and counts it once", (await shows(page, "Selected: pear")) && (await shows(page, "Selections: 1")));
  check("one nv-qty-input with the selected qty as its value property", (await qtyInput.count()) === 1 && (await qtyInput.evaluate((el) => (el as HTMLElement & { value?: unknown }).value)) === 0);

  await qtyInput.evaluate((el) => {
    const input = el as ItemElement;
    input.trialEvents = [];
    el.addEventListener("value-change", (e) => input.trialEvents?.push((e as CustomEvent).detail));
  });
  await setQty("5");
  const valueDetail = await qtyInput.evaluate((el) => (el as ItemElement).trialEvents?.at(-1));
  check("typing emits value-change with detail { value: number }", JSON.stringify(valueDetail) === JSON.stringify({ value: 5 }), valueDetail);
  const pearQty = await byName("pear").evaluate((el) => (el as ItemElement).item?.qty);
  check("the page updates the item from value-change", pearQty === 5 && !(await shows(byName("pear"), "low stock")) && !(await shows(byName("pear"), "out of stock")), pearQty);
  check("the input's value property follows the Vue state", (await qtyInput.evaluate((el) => (el as HTMLElement & { value?: unknown }).value)) === 5);
  check("the summary total follows the quantities", await shows(summary, "Total: 15"), await summary.allInnerTexts());

  await byName("apple").getByRole("button", { name: "Select", exact: true }).click();
  check("selecting another item counts it", (await shows(page, "Selected: apple")) && (await shows(page, "Selections: 2")));
  await setQty("0");
  check("the badge appears when Vue adds it to an item that had none", (await shows(byName("apple"), "out of stock")) && (await shows(byName("apple"), "low stock")));

  await items.evaluateAll((els) => els.forEach((el, i) => ((el as ItemElement).trialMark = i)));
  await page.getByRole("button", { name: "Reverse order", exact: true }).click();
  const after = await items.evaluateAll((els) => els.map((el) => [(el as ItemElement).item?.name, (el as ItemElement).trialMark]));
  check("Reverse order moves the same elements", JSON.stringify(after) === JSON.stringify([["plum", 2], ["pear", 1], ["apple", 0]]), after);
  check("moved items keep their content", (await shows(byName("apple"), "out of stock")) && (await shows(byName("plum"), "plum")) && !(await shows(byName("pear"), "out of stock")));

  const kept = await summary.elementHandle();
  await page.getByRole("button", { name: "Toggle summary", exact: true }).click();
  check("a hidden summary is out of the document", (await summary.count()) === 0 && (await kept?.evaluate((el) => el.isConnected)) === false);
  await setQty("2");
  await page.getByRole("button", { name: "Toggle summary", exact: true }).click();
  await summary.waitFor({ timeout: 5000 });
  check("KeepAlive brings back the same summary element", (await kept?.evaluate((el) => el.isConnected && document.querySelector("nv-inventory-summary") === el)) === true);
  check("the summary shows the current total after coming back", await shows(summary, "Total: 14"), await summary.allInnerTexts());
}
