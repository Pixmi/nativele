// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, Page } from "playwright-core";
import { launchChrome, startServer } from "./server.ts";

let browser: Browser;
let page: Page;
let stop: () => void;
const errors: string[] = [];

beforeAll(async () => {
  const s = await startServer(5314);
  stop = s.stop;
  browser = await launchChrome();
  page = await browser.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  // The cells are built with DOM calls, so the recipe also runs where Trusted Types is enforced.
  await page.route("**/browser/fixtures/page.html", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), "content-security-policy": "require-trusted-types-for 'script'" } });
  });
  await page.goto(`${s.url}/browser/fixtures/page.html`);
  await page.waitForFunction(() => customElements.get("user-table") && customElements.get("status-badge"));
  // A string, so that vitest does not rewrite the dynamic imports that run in the page
  await page.evaluate(`Promise.all([import("/browser/fixtures/users.ts"), import("/browser/fixtures/user-columns.ts")]).then(([{ users }, { userColumns }]) => {
    const table = document.createElement("user-table");
    table.columns = userColumns;
    document.body.append(table);
    users.set([
      { id: 1, name: "Grace", email: "grace@example.com", status: "active" },
      { id: 2, name: "Ada", email: "ada@example.com", status: "invited" },
      { id: 3, name: "Linus", email: "linus@example.com", status: "active" },
    ]);
  })`);
}, 60_000);

afterAll(async () => {
  await browser?.close();
  stop?.();
});

const headers = () => page.$$eval("user-table th", (ths) => ths.map((th) => (th as HTMLElement).innerText.trim()));
const cells = () => page.$$eval("user-table tbody tr", (trs) => trs.map((tr) => [...tr.querySelectorAll("td")].map((td) => td.textContent?.trim())));

describe("Table with configurable columns (real Chrome)", () => {
  it("builds the headers and the cells of each row from the column config", async () => {
    expect(await headers()).toEqual(["Name", "Email", "Status", "Actions"]);
    expect(await cells()).toEqual([
      ["Grace", "grace@example.com", "active", "Remove"],
      ["Ada", "ada@example.com", "invited", "Remove"],
      ["Linus", "linus@example.com", "active", "Remove"],
    ]);
    expect(await page.$$eval("user-table td status-badge span.badge", (b) => b.length)).toBe(3);
    expect(await page.$$eval("user-table th button:not([hidden])", (b) => b.map((x) => x.textContent))).toEqual(["Name"]);
  });

  it("exposes a table with rows and cells to assistive technology", async () => {
    expect(await page.getByRole("row").count()).toBe(4);
    expect(await page.getByRole("cell", { name: "ada@example.com" }).count()).toBe(1);
    expect(await page.getByRole("columnheader", { name: "Status" }).count()).toBe(1);
  });

  it("sorts by a column with a comparator, moving the rows without rebuilding their cells", async () => {
    await page.evaluate(() => {
      for (const td of document.querySelectorAll("user-table td")) td.setAttribute("data-kept", "");
    });
    await page.click("user-table th button");
    expect((await cells()).map((r) => r[0])).toEqual(["Ada", "Grace", "Linus"]);
    expect(await page.getAttribute("user-table th:first-child", "aria-sort")).toBe("ascending");
    await page.click("user-table th button");
    expect((await cells()).map((r) => r[0])).toEqual(["Linus", "Grace", "Ada"]);
    expect(await page.getAttribute("user-table th:first-child", "aria-sort")).toBe("descending");
    expect(await page.$$eval("user-table td:not([data-kept])", (tds) => tds.length)).toBe(0);
  });

  it("a click on a button in a cell reaches the table", async () => {
    await page.click("user-table button[aria-label='Remove Grace']");
    expect((await cells()).map((r) => r[0])).toEqual(["Linus", "Ada"]);
    expect(await page.$$eval("user-table td:not([data-kept])", (tds) => tds.length)).toBe(0);
  });

  it("a column change rebuilds the cells of every row", async () => {
    await page.evaluate(() => {
      const table = document.querySelector("user-table")!;
      table.columns = table.columns.filter((c) => c.id !== "email");
    });
    expect(await headers()).toEqual(["Name", "Status", "Actions"]);
    expect(await cells()).toEqual([
      ["Linus", "active", "Remove"],
      ["Ada", "invited", "Remove"],
    ]);
    expect(await page.$$eval("user-table td[data-kept]", (tds) => tds.length)).toBe(0);
    expect(errors).toEqual([]);
  });
});
