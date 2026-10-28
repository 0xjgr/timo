import assert from "node:assert/strict";
import { test } from "node:test";
import { RULE_CASES } from "./cases.ts";
import { RULE_IDS } from "./verdict.ts";

test("every rule has at least one case", () => {
  const covered = new Set(RULE_CASES.map((ruleCase) => ruleCase.rule));
  for (const rule of RULE_IDS) assert.ok(covered.has(rule), `no case for ${rule}`);
});

test("only allow cases come without a rule", () => {
  for (const ruleCase of RULE_CASES) {
    assert.equal(ruleCase.rule === undefined, ruleCase.expected === "allow", ruleCase.name);
  }
});
