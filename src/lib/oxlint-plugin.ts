import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { A11Y_RULES, checkA11y } from "./a11y.ts";
import { componentClasses, contractsAt, contractsFor, DATA_FLOW_RULES, dataFlow, templateCode, UNUSED_MARKUP_RULES, unusedMarkup } from "./lint.ts";
import type { Contracts } from "./lint.ts";
import type { Diagnostic } from "./codegen.ts";

interface ImportNode {
  type: "ImportDeclaration";
  source: { value: string };
}
interface Fixer {
  insertTextBeforeRange(range: [number, number], text: string): unknown;
}
interface Suggestion {
  desc: string;
  fix(fixer: Fixer): unknown;
}
interface Context {
  options?: [{ ignore?: string[] }?];
  filename: string;
  sourceCode: { text: string };
  report(d: { message: string; node: unknown; suggest?: Suggestion[] }): void;
}

type Group = "unused-markup" | "data-flow" | "a11y";

const ignoreSchema = [
  {
    type: "object",
    properties: { ignore: { type: "array", items: { type: "string" } } },
    additionalProperties: false,
  },
];

/** Child component contracts, scanned once per process from the working directory. */
let contracts: Contracts | null = null;
const getContracts = () => (contracts ??= contractsFor([process.cwd()]));

// Each template is analyzed once per group for a given file text and template text, however many rules ask for it.
const cache = new Map<string, { code: string; html: string; diags: Diagnostic[] }>();
function groupDiagnostics(group: Group, html: string, code: string, spec: string, filename: string): Diagnostic[] {
  const key = `${group}\0${filename}\0${spec}`;
  const hit = cache.get(key);
  if (hit && hit.code === code && hit.html === html) return hit.diags;
  const diags = group === "unused-markup" ? unusedMarkup(html, templateCode(code, spec)) : group === "a11y" ? checkA11y(html, [], contractsAt(getContracts(), filename)) : dataFlow(html, componentClasses(code, spec), [], contractsAt(getContracts(), filename));
  cache.set(key, { code, html, diags });
  return diags;
}

function readTemplate(filename: string, spec: string): string | null {
  try {
    return readFileSync(resolve(dirname(filename), spec.slice(0, -3)), "utf8");
  } catch {
    return null; // a missing file is reported by tsc / the bundler
  }
}

/** A missing handler can be added to the class that uses the template: offered as a suggestion, since the method body is the developer's to write. */
function suggestionsFor(d: Diagnostic, code: string, spec: string): Suggestion[] | undefined {
  if (d.rule !== "missing-handler") return undefined;
  const name = /="([^"]+)"/.exec(d.message)?.[1];
  const target = componentClasses(code, spec)[0];
  if (!name || !target) return undefined;
  return [{ desc: `Add a method ${name}() to the component class`, fix: (fixer) => fixer.insertTextBeforeRange([target.end, target.end], `\n  ${name}(_e: Event): void {}\n`) }];
}

/**
 * Build an oxlint rule that checks every `import x from "./name.html.js"` and reports the findings
 * on the import line (an oxlint plugin can only report inside the file being linted).
 * The message starts with the HTML location, the rule id and what to do: `./x.html.js:3:5 [unused-ref] ...`.
 * `only` limits the rule to one rule id of the group; without it the rule reports the whole group, minus `ignore`.
 */
function templateRule(group: Group, description: string, only?: string) {
  return {
    meta: { type: "suggestion" as const, docs: { description }, schema: only ? [] : ignoreSchema, hasSuggestions: true },
    create(context: Context) {
      return {
        ImportDeclaration(node: ImportNode) {
          const spec = node.source.value;
          if (!spec.endsWith(".html.js")) return;
          const html = readTemplate(context.filename, spec);
          if (html === null) return;
          const code = context.sourceCode.text;
          const ignore = context.options?.[0]?.ignore ?? [];
          for (const d of groupDiagnostics(group, html, code, spec, context.filename)) {
            if (only ? d.rule !== only : ignore.includes(d.rule)) continue;
            const suggest = suggestionsFor(d, code, spec);
            context.report({ message: `${spec}:${d.line}:${d.col} [${d.rule}] ${d.message}`, node, ...(suggest ? { suggest } : {}) });
          }
        },
      };
    },
  };
}

const perRule = (group: Group, rules: Record<string, string>) => Object.fromEntries(Object.entries(rules).map(([id, description]) => [id, templateRule(group, description, id)]));
const { "no-importer": _noImporter, ...unusedMarkupRules } = UNUSED_MARKUP_RULES;
const { "unchecked-custom-elements": _unchecked, ...dataFlowRules } = DATA_FLOW_RULES;

export default {
  meta: { name: "ts-dom" },
  rules: {
    /** The HTML declares markup that this file never uses. Reported as errors. */
    "unused-markup": templateRule("unused-markup", "Markup declared in the HTML (data-ref, data-if, data-each, {{ }}, data-on-*) must be used by the component class"),
    /** ARIA and basic accessibility problems in the template. Off by default. */
    a11y: templateRule("a11y", "Check the template for ARIA and basic accessibility problems"),
    /** Data flow suggestions and child component contract checks. Off by default. */
    "data-flow": templateRule("data-flow", "Keep props flowing down and events flowing up one level at a time, and check child component attributes and events"),
    // One rule per rule id, so a project can give each its own severity (for example "ts-dom/unused-ref": "warn").
    ...perRule("unused-markup", unusedMarkupRules),
    ...perRule("data-flow", dataFlowRules),
    ...perRule("a11y", Object.fromEntries(Object.entries(A11Y_RULES).map(([k, v]) => [k, v.split(". Fix:")[0] as string]))),
  },
};
