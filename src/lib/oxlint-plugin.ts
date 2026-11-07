import { dirname, relative, resolve, sep } from "node:path";
import { A11Y_RULES, checkA11y } from "./a11y.ts";
import { contractsAt, contractsFor, DATA_FLOW_RULES, dataFlow, templateUsage, UNUSED_MARKUP_RULES } from "./lint.ts";
import type { Contracts } from "./lint.ts";
import { analyze } from "./codegen.ts";
import type { Analysis, Diagnostic } from "./codegen.ts";
import { diskSources, indexDirs, TEMPLATE_SPEC } from "./components.ts";
import type { ComponentIndex, Sources } from "./components.ts";

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

type Group = "unused-markup" | "data-flow" | "a11y";

const ignoreSchema = [
  {
    type: "object",
    properties: { ignore: { type: "array", items: { type: "string" } } },
    additionalProperties: false,
  },
];

let project: { sources: Sources; index: ComponentIndex; contracts: Contracts } | null = null;
const getProject = () => {
  if (!project) {
    const sources = diskSources();
    const index = indexDirs([process.cwd()], sources);
    project = { sources, index, contracts: contractsFor([process.cwd()], process.cwd(), index, sources) };
  }
  return project;
};

const cache = new Map<string, { analysis: Analysis; diags: Partial<Record<Group, Diagnostic[]>> }>();
function groupDiagnostics(group: Group, html: string): Diagnostic[] {
  const { sources, index, contracts } = getProject();
  const text = sources.text(html) ?? "";
  let hit = cache.get(html);
  if (!hit) cache.set(html, (hit = { analysis: analyze(text), diags: {} }));
  const a = hit.analysis;
  return (hit.diags[group] ??=
    group === "unused-markup"
      ? (templateUsage(html, text, a, index, sources) ?? [])
      : group === "a11y"
        ? checkA11y(text, [], contractsAt(contracts, html), a.root)
        : dataFlow(text, index.byTemplate.get(html) ?? [], contractsAt(contracts, html), a));
}

/**
 * The templates whose findings belong on the import of `spec` in `file`: those of the classes declared in `file` that get their template through this import,
 * and the template the import names itself when no class anywhere uses it.
 */
function templatesThrough(file: string, spec: string): { html: string; label: string }[] {
  const { index } = getProject();
  const facts = index.modules.get(file);
  const locals = new Set(facts?.imports.filter((i) => i.spec === spec).map((i) => i.local));
  const out = new Map<string, string>();
  for (const c of index.components) if (c.file === file && c.template && c.arg && locals.has(c.arg)) out.set(c.template, "");
  const named = TEMPLATE_SPEC.exec(spec)?.[1];
  const direct = named && resolve(dirname(file), named);
  if (direct && !index.byTemplate.has(direct) && index.importers.get(direct)?.some((i) => i.file === file)) out.set(direct, "");
  return [...out.keys()].map((html) => ({ html, label: html === direct ? spec : `./${relative(dirname(file), html).split(sep).join("/")}` }));
}

/**
 * Build an oxlint rule that reports the findings of each template on the import that brings it into the file of the class that uses it
 * (an oxlint plugin can only report inside the file being linted).
 * The message starts with the HTML location, the rule id and what to do: `./x.html.js:3:5 [unused-ref] ...`.
 * `only` limits the rule to one rule id of the group; without it the rule reports the whole group, minus `ignore`.
 */
function templateRule(group: Group, description: string, only?: string) {
  return {
    meta: { type: "suggestion" as const, docs: { description }, schema: only ? [] : ignoreSchema },
    create(context: Context) {
      return {
        ImportDeclaration(node: ImportNode) {
          const ignore = context.options?.[0]?.ignore ?? [];
          for (const { html, label } of templatesThrough(resolve(context.filename), node.source.value)) {
            for (const d of groupDiagnostics(group, html)) {
              if (only ? d.rule !== only : ignore.includes(d.rule)) continue;
              context.report({ message: `${label}:${d.line}:${d.col} [${d.rule}] ${d.message}`, node });
            }
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
    /** The HTML declares markup that the component class never uses. Reported as errors. */
    "unused-markup": templateRule("unused-markup", "Markup declared in the HTML (data-ref, data-if, data-each, {{ }}, data-on-*) must be used by the component class"),
    /** ARIA and basic accessibility problems in the template. Off by default. */
    a11y: templateRule("a11y", "Check the template for ARIA and basic accessibility problems"),
    /** Data flow suggestions and child component contract checks. Off by default. */
    "data-flow": templateRule("data-flow", "Keep props flowing down and events flowing up one level at a time, and check child component attributes and events"),
    // One rule per rule id, so a project can give each its own severity (for example "ts-dom/unused-ref": "warn").
    ...perRule("unused-markup", unusedMarkupRules),
    ...perRule("data-flow", dataFlowRules),
    ...perRule("a11y", A11Y_RULES),
  },
};
