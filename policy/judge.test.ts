import assert from "node:assert/strict";
import { test } from "node:test";
import { LEDGER, RULE_CASES } from "./cases.ts";
import { judgeCommit } from "./judge.ts";

for (const ruleCase of RULE_CASES) {
  test(`${ruleCase.expected} ${ruleCase.rule ?? ""}: ${ruleCase.name}`, () => {
    const verdict = judgeCommit(ruleCase.commit, LEDGER);
    assert.equal(verdict.kind, ruleCase.expected);
    if (verdict.kind !== "allow") {
      assert.equal(verdict.rule, ruleCase.rule);
      assert.ok(verdict.reason.length > 0);
    }
  });
}

test("a flagged source never softens a deny", () => {
  const swap = RULE_CASES.find((ruleCase) => ruleCase.rule === "payee-drift")!;
  const flagged = { ...swap.commit, flaggedSourceIds: ["fake-invoice"] };
  assert.equal(judgeCommit(flagged, LEDGER).kind, "deny");
});

test("an empty ledger asks for every iban", () => {
  const legit = RULE_CASES.find((ruleCase) => ruleCase.expected === "allow")!;
  assert.deepEqual(judgeCommit(legit.commit, []).kind, "ask");
});
