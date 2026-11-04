import { describe, expect, it } from "vitest";
import { A11Y_RULES } from "../src/lib/a11y.ts";
import { CHECK_RULES } from "../src/lib/check.ts";
import { CODEGEN_RULES } from "../src/lib/codegen.ts";
import { DOCTOR_RULES } from "../src/lib/doctor.ts";
import { DATA_FLOW_RULES, UNUSED_MARKUP_RULES } from "../src/lib/lint.ts";
import { RULE_DOCS } from "../src/lib/rule-docs.ts";

describe("rule docs", () => {
  it("every rule id has a why, a wrong example and a right example, and no doc is left over", () => {
    const ids = new Set([CODEGEN_RULES, CHECK_RULES, DOCTOR_RULES, UNUSED_MARKUP_RULES, DATA_FLOW_RULES, A11Y_RULES].flatMap((m) => Object.keys(m)));
    for (const id of ids) {
      const doc = RULE_DOCS[id];
      expect(doc, `no doc for ${id}`).toBeDefined();
      expect(doc?.why.length && doc.bad.length && doc.good.length, id).toBeTruthy();
    }
    expect(Object.keys(RULE_DOCS).filter((id) => !ids.has(id))).toEqual([]);
  });
});
