import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { VerdictLog } from "../gate/verdict-log.ts";
import { LEDGER, RULE_CASES } from "../policy/cases.ts";
import { judgeCommit } from "../policy/judge.ts";
import { writeDay } from "./write-day.ts";

async function logCases(names: string[]): Promise<string> {
  const runDir = await mkdtemp(join(tmpdir(), "timo-guardian-"));
  const opened = await VerdictLog.open(`${runDir}/verdicts.jsonl`, "abc1234");
  assert.ok(opened.ok);
  for (const name of names) {
    const commit = RULE_CASES.find((ruleCase) => ruleCase.name === name)!.commit;
    await opened.value.append(commit, judgeCommit(commit, LEDGER), "none");
  }
  return runDir;
}

test("an intact log lists every verdict and links the lens page that exists", async () => {
  const runDir = await logCases(["iban swap from a lookalike domain", "legit bill from the real portal"]);
  await mkdir(`${runDir}/lens`);
  await writeFile(`${runDir}/lens/verdict-0.html`, "");
  const html = await readFile(await writeDay(runDir, LEDGER, "test"), "utf8");
  assert.match(html, /Intact\./);
  assert.match(html, /DENY[\s\S]*payee-drift/);
  assert.match(html, /ALLOW/);
  assert.match(html, /href="lens\/verdict-0.html"/);
  assert.doesNotMatch(html, /verdict-1.html|card-0.html/);
});

test("a broken log shows where it breaks and hides the entries after it", async () => {
  const runDir = await logCases(["legit bill from the real portal", "iban swap from a lookalike domain"]);
  const path = `${runDir}/verdicts.jsonl`;
  await writeFile(path, (await readFile(path, "utf8")).replace("payee-drift", "payee-new"));
  const html = await readFile(await writeDay(runDir, LEDGER, "test"), "utf8");
  assert.match(html, /Broken at line 2/);
  assert.match(html, /ALLOW/);
  assert.doesNotMatch(html, /DENY|payee-new/);
});

test("a title from the outside is escaped", async () => {
  const runDir = await logCases([]);
  const html = await readFile(await writeDay(runDir, LEDGER, "<img src=x onerror=alert(1)>"), "utf8");
  assert.doesNotMatch(html, /<img/);
});
