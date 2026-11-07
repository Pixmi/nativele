import { dirname, relative, resolve, sep } from "node:path";
import { A11Y_RULES } from "./a11y.ts";
import { DATA_FLOW_RULES, indexBehind, lintProject, lintTemplate, UNUSED_MARKUP_RULES } from "./lint.ts";
import type { Group, LintProject, TemplateFindings } from "./lint.ts";
import type { Diagnostic } from "./codegen.ts";
import { TEMPLATE_SPEC, Workspace } from "./components.ts";

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

const GROUPS: readonly Group[] = ["unused-markup", "data-flow", "a11y"];
// The language server keeps the plugin loaded while the files change: a call reuses what it read while the files keep their content, and lists the folders again at most once a second.
const ws = new Workspace();
const LISTING_AGE = 1000;
const project = (): LintProject => lintProject(ws, [process.cwd()], process.cwd(), LISTING_AGE);

type Found = { label: string; findings: TemplateFindings }[];

/** The findings of the templates the import `node` brings into `file`, with `text` as the file's content. The rules of one lint of the file visit the same node, so they share the answer. */
const answered = new WeakMap<object, Found>();
function findingsThrough(node: ImportNode, file: string, text: string): Found {
  const known = answered.get(node);
  if (known) return known;
  const spec = node.source.value;
  ws.overlay(file, text);
  ws.rev(file);
  try {
    let p = project();
    if (templatesThrough(p, file, spec).some(({ html }) => indexBehind(p, html, GROUPS))) p = lintProject(ws, [process.cwd()], process.cwd());
    const found = templatesThrough(p, file, spec).map(({ html, label }) => ({ label, findings: lintTemplate(p, html, GROUPS).value }));
    answered.set(node, found);
    return found;
  } finally {
    ws.overlay(file, undefined);
  }
}

const ofGroup = (r: TemplateFindings, group: Group): Diagnostic[] => (group === "unused-markup" ? (r.usage ?? []) : group === "a11y" ? r.a11y : r.flow);

/**
 * The templates whose findings belong on the import of `spec` in `file`: those of the classes declared in `file` that get their template through this import,
 * and the template the import names itself when no class anywhere uses it.
 */
function templatesThrough({ index }: LintProject, file: string, spec: string): { html: string; label: string }[] {
  const facts = index.modules.get(file);
  const locals = new Set(facts?.imports.filter((i) => i.spec === spec).map((i) => i.local));
  const out = new Map<string, string>();
  for (const c of index.byFile.get(file) ?? []) if (c.template && c.arg && locals.has(c.arg)) out.set(c.template, "");
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
          for (const { label, findings } of findingsThrough(node, resolve(context.filename), context.sourceCode.text)) {
            for (const d of ofGroup(findings, group)) {
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
