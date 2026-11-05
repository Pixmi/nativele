import { expect, test } from "@playwright/test";

test("the built page renders the components and they respond", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  const counter = page.locator("counter-card");
  await expect(counter.locator("p").first()).toHaveText("Clicks: 0");
  await counter.getByRole("button", { name: "+1" }).click();
  await expect(counter.locator("b")).toHaveText("1");
  await expect(page.locator("todo-list todo-row")).toHaveText(["Write tests", "Run them in Chrome"]);
  await expect(page.locator("light-panel h2")).toHaveText("Light");
  await expect(page.locator("shadow-panel h2")).toHaveText("Untitled");
  await expect(page.getByRole("heading", { name: "Shadow" })).toBeVisible();
  expect(errors).toEqual([]);
});
