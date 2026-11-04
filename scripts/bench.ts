// Large list benchmark in real Chrome. Run by hand (npm run bench); it is not part of CI, since timings depend on the machine.
import { launchChrome, startServer } from "../browser/server.ts";

const sizes = [1000, 5000, 10000];
const s = await startServer(5320);
const browser = await launchChrome();
try {
  const page = await browser.newPage();
  await page.goto(`${s.url}/browser/bench/bench-page.html`);
  await page.waitForFunction(() => "bench" in window);
  const result = (await page.evaluate((n) => (window as unknown as { bench(sizes: number[]): Record<string, Record<string, number>> }).bench(n), sizes)) as Record<string, Record<string, number>>;
  const columns = Object.keys(Object.values(result)[0] ?? {});
  console.log(`| Approach | Items | ${columns.join(" | ")} |`);
  console.log(`|---|---|${columns.map(() => "---").join("|")}|`);
  for (const [key, row] of Object.entries(result)) {
    const [name, n] = key.split(" | ");
    console.log(`| ${name} | ${n} | ${columns.map((c) => `${row[c]} ms`).join(" | ")} |`);
  }
} finally {
  await browser.close();
  s.stop();
}
