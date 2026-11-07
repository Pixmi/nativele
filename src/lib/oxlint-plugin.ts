import { dirname, relative, resolve, sep } from "node:path";
import { A11Y_RULES } from "./a11y.ts";
import { analyze } from "./codegen.ts";
import type { Analysis, Diagnostic } from "./codegen.ts";
import { Memo, TEMPLATE_SPEC, Workspace } from "./components.ts";
import { DATA_FLOW_RULES, lintProject, lintTemplate, UNUSED_MARKUP_RULES } from "./lint.ts";
import type { Group, LintProject, TemplateFindings } from "./lint.ts";

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

const memo = new Memo();

/**
 * The lints oxlint makes in one turn of the event loop (in the editor, those that one change starts; on the command line, a batch of files) are one run: they read each file once, and the project they need is built once from it.
 * The linted file is read as oxlint gives it, which in the editor can be an unsaved buffer.
 */
let run: { ws: Workspace; p?: LintProject; nodes: WeakMap<object, Through> } | undefined;

interface Through {
  file: string;
  p: LintProject;
  templates: { html: string; label: string }[];
  parse: (text: string) => Analysis;
}

/** The templates the import `node` brings into `file`, with `text` as the file's content, and the project they are linted in. The rules of one lint of the file visit the same node, so they share it, and parse each template at most once. */
function through(node: ImportNode, file: string, text: string): Through {
  if (!run) {
    run = { ws: new Workspace(memo), nodes: new WeakMap() };
    setImmediate(() => (run = undefined));
  }
  const known = run.nodes.get(node);
  if (known?.file === file) return known;
  if (run.ws.overlay(file, text)) delete run.p;
  const p = (run.p ??= lintProject(run.ws, [process.cwd()], process.cwd()));
  const parsed = new Map<string, Analysis>();
  const parse = (t: string) => parsed.get(t) ?? (parsed.set(t, analyze(t)).get(t) as Analysis);
  const found = { file, p, templates: templatesThrough(p, file, node.source.value), parse };
  run.nodes.set(node, found);
  return found;
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
  const pathTo = (html: string) => {
    const rel = relative(dirname(file), html).split(sep).join("/");
    return rel.startsWith("../") ? rel : `./${rel}`;
  };
  return [...out.keys()].map((html) => ({ html, label: html === direct ? spec : pathTo(html) }));
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
          const { p, templates, parse } = through(node, resolve(context.filename), context.sourceCode.text);
          for (const { html, label } of templates) {
            for (const d of ofGroup(lintTemplate(p, html, [group], parse), group)) {
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
