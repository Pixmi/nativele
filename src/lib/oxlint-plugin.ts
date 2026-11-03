import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { checkA11y } from "./a11y.ts";
import { componentClasses, contractsFor, dataFlow, templateCode, unusedMarkup } from "./lint.ts";
import type { Contract } from "./lint.ts";
import type { Diagnostic } from "./codegen.ts";

interface ImportNode {
  type: "ImportDeclaration";
  source: { value: string };
}
interface Context {
  options?: [{ ignore?: string[] }?];
  filename: string;
  sourceCode: { text: string };
  report(d: { message: string; node: unknown }): void;
}

const ignoreSchema = [
  {
    type: "object",
    properties: { ignore: { type: "array", items: { type: "string" } } },
    additionalProperties: false,
  },
];

/** Child component contracts, scanned once per process from the working directory. */
let contracts: Map<string, Contract> | null = null;
const getContracts = () => (contracts ??= contractsFor([process.cwd()]));

/**
 * Build an oxlint rule that runs `check` on every `import x from "./name.html.js"` and reports the findings
 * on the import line (an oxlint plugin can only report inside the file being linted).
 * The message starts with the HTML location, the rule id and what to do: `./x.html.js:3:5 [unused-ref] ...`.
 */
function templateRule(
  description: string,
  check: (html: string, ctx: Context, spec: string) => Diagnostic[],
) {
  return {
    meta: { type: "suggestion" as const, docs: { description }, schema: ignoreSchema },
    create(context: Context) {
      return {
        ImportDeclaration(node: ImportNode) {
          const spec = node.source.value;
          if (!spec.endsWith(".html.js")) return;
          let html: string;
          try {
            html = readFileSync(resolve(dirname(context.filename), spec.slice(0, -3)), "utf8");
          } catch {
            return; // a missing file is reported by tsc / the bundler
          }
          for (const d of check(html, context, spec)) {
            context.report({ message: `${spec}:${d.line}:${d.col} [${d.rule}] ${d.message}`, node });
          }
        },
      };
    },
  };
}

const ignored = (c: Context) => c.options?.[0]?.ignore ?? [];

export default {
  meta: { name: "ts-dom" },
  rules: {
    /** The HTML declares markup that this file never uses. Always on when enabled; reported as errors. */
    "unused-markup": templateRule("Markup declared in the HTML (data-ref, data-if, data-each, {{ }}, data-on-*) must be used by the component class", (html, c, spec) =>
      unusedMarkup(html, templateCode(c.sourceCode.text, spec)).filter((d) => !ignored(c).includes(d.rule)),
    ),
    /** ARIA and basic accessibility problems in the template. Off by default. */
    a11y: templateRule("Check the template for ARIA and basic accessibility problems", (html, c) => checkA11y(html, ignored(c))),
    /** Data flow suggestions and child component contract checks. Off by default. */
    "data-flow": templateRule("Keep props flowing down and events flowing up one level at a time, and check child component attributes and events", (html, c, spec) =>
      dataFlow(html, componentClasses(c.sourceCode.text, spec), ignored(c), getContracts()),
    ),
  },
};
