import { expect, test, type Page } from "@playwright/test";

let errors: string[] = [];

test.beforeEach(({ page }) => {
  errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
});
test.afterEach(() => expect(errors).toEqual([]));

const outlet = (page: Page) => page.locator("#outlet");
const markDocument = (page: Page) => page.evaluate(() => Object.assign(window, { sameDocument: true }));
const sameDocument = (page: Page) => page.evaluate(() => "sameDocument" in window);

test("a deep link loads the app and renders that page", async ({ page }) => {
  await page.goto("/projects/p1");
  await expect(outlet(page).getByRole("heading", { level: 1 })).toHaveText("Website");
  await expect(page.locator("app-nav a[aria-current=page]")).toHaveText("Projects");
});

test("links change the page without loading a new document, and the feature store keeps the data across pages", async ({ page }) => {
  await page.goto("/");
  await markDocument(page);
  await page.getByLabel("New project").fill("Docs");
  await page.getByRole("button", { name: "Add project" }).click();
  await page.getByRole("link", { name: "Docs" }).click();
  await expect(page).toHaveURL(/\/projects\/p5$/);
  await expect(outlet(page).getByRole("heading", { level: 1 })).toHaveText("Docs");
  await page.getByLabel("New task").fill("Outline");
  await page.getByRole("button", { name: "Add task" }).click();
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("project-card", { hasText: "Docs" }).locator("progress-meter span")).toHaveText("0 of 1 done");
  await page.goForward();
  await expect(page.locator("task-row")).toHaveText(["Outline"]);
  expect(await sameDocument(page)).toBe(true);
});

test("the app-wide store carries settings to the shell and to another feature", async ({ page }) => {
  await page.goto("/settings");
  await page.getByLabel("Your name").fill("Ada");
  await page.getByLabel("Show done tasks").uncheck();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator("app-nav p")).toHaveText("Signed in as Ada");
  await page.getByRole("link", { name: "Projects" }).click();
  await page.getByRole("link", { name: "Website" }).click();
  await expect(page.locator("task-row")).toHaveText(["Pick the fonts", "Publish"]);
  await expect(outlet(page)).toContainText("1 done tasks are hidden.");
});

test("each page module is loaded only when its route is first shown", async ({ page }) => {
  const scripts: string[] = [];
  page.on("request", (r) => {
    if (r.resourceType() === "script") scripts.push(new URL(r.url()).pathname.replace(/-[\w-]{8}\.js$/, ".js"));
  });
  await page.goto("/settings");
  await expect(outlet(page).getByRole("heading", { level: 1 })).toHaveText("Settings");
  expect(scripts.sort()).toEqual(["/assets/index.js", "/assets/settings-page.js"]);
  await page.getByRole("link", { name: "Projects" }).click();
  await expect(outlet(page).getByRole("heading", { level: 1 })).toHaveText("Projects");
  expect(scripts).toContain("/assets/projects-page.js");
  expect(scripts).not.toContain("/assets/project-page.js");
});

test("a navigation started while a page module is still loading wins over it", async ({ page }) => {
  await page.route("**/assets/projects-page-*.js", async (route) => {
    await new Promise((r) => setTimeout(r, 1000));
    await route.continue();
  });
  await page.goto("/settings");
  await expect(outlet(page).getByRole("heading", { level: 1 })).toHaveText("Settings");
  await page.getByRole("link", { name: "Projects" }).click();
  await page.evaluate(() => navigation.navigate("/projects/p2").finished);
  await page.waitForTimeout(1500);
  await expect(page).toHaveURL(/\/projects\/p2$/);
  await expect(outlet(page).getByRole("heading", { level: 1 })).toHaveText("Mobile app");
});

test("a page module that fails to load shows a message instead of the page", async ({ page }) => {
  await page.route("**/assets/project-page-*.js", (route) => route.abort());
  await page.goto("/");
  await page.getByRole("link", { name: "Website" }).click();
  await expect(outlet(page).getByRole("heading", { level: 1 })).toHaveText("This page could not be loaded");
  errors = errors.filter((e) => !e.includes("Failed to fetch dynamically imported module"));
});

test("an unknown path shows the not-found page", async ({ page }) => {
  await page.goto("/nowhere");
  await expect(outlet(page).getByRole("heading", { level: 1 })).toHaveText("Page not found");
});

test("without the Navigation API, links load the next document and the router still renders the route", async ({ page }) => {
  await page.addInitScript(() => {
    Reflect.deleteProperty(window, "navigation");
  });
  await page.goto("/");
  expect(await page.evaluate(() => "navigation" in window)).toBe(false);
  await markDocument(page);
  await page.getByRole("link", { name: "Website" }).click();
  await expect(outlet(page).getByRole("heading", { level: 1 })).toHaveText("Website");
  expect(await sameDocument(page)).toBe(false);
});
