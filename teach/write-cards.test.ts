import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { VerdictLog } from "../gate/verdict-log.ts";
import { LEDGER, RULE_CASES } from "../policy/cases.ts";
import { judgeCommit } from "../policy/judge.ts";
import { writeTemplate } from "./explain-verdict.ts";
import { writeCards } from "./write-cards.ts";

const swap = RULE_CASES.find((entry) => entry.name === "iban swap from a lookalike domain")!.commit;
const byTemplate = async (facts: Parameters<typeof writeTemplate>[0]) => ({ text: writeTemplate(facts), by: "template" as const, spentUsd: 0 });

async function logSwap(): Promise<string> {
  const runDir = await mkdtemp(join(tmpdir(), "timo-teach-"));
  const opened = await VerdictLog.open(`${runDir}/verdicts.jsonl`, "abc1234");
  assert.ok(opened.ok);
  await opened.value.append(swap, judgeCommit(swap, LEDGER), "teach-card");
  return runDir;
}

test("a payee-drift entry becomes a card with both account endings and the ledger phone", async () => {
  const runDir = await logSwap();
  const written = await writeCards(runDir, LEDGER, byTemplate);
  assert.ok(written.ok);
  assert.equal(written.value.files.length, 1);
  const html = await readFile(written.value.files[0]!, "utf8");
  assert.match(html, /Timo stopped a payment/);
  assert.match(html, /<b>1332<\/b>[\s\S]*<b>7892<\/b>/);
  assert.match(html, /\+34 900 100 200/);
  assert.doesNotMatch(html, /ES60/);
});

test("an edited verdict log writes no card", async () => {
  const runDir = await logSwap();
  const path = `${runDir}/verdicts.jsonl`;
  await writeFile(path, (await readFile(path, "utf8")).replace("payee-drift", "payee-new"));
  const written = await writeCards(runDir, LEDGER, byTemplate);
  assert.equal(written.ok, false);
});

test("model words are escaped on the card", async () => {
  const runDir = await logSwap();
  const written = await writeCards(runDir, LEDGER, async () => ({ text: "<script>alert(1)</script>", by: "spark-open", spentUsd: 0 }));
  assert.ok(written.ok);
  const html = await readFile(written.value.files[0]!, "utf8");
  assert.doesNotMatch(html, /<script>/);
});
