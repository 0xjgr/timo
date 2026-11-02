import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { Commit } from "./commit.ts";
import { listVerdicts, VerdictLog, verifyChain } from "./verdict-log.ts";

const SWAP: Commit = {
  via: "click",
  hasPassedClickGate: true,
  pageUrl: "http://bancosol.es/bank",
  pageDomain: "bancosol.es",
  targetDomain: "bancosol.es",
  values: [{ kind: "iban", value: "ES6000491500051234567892", origins: [{ kind: "foreign", sourceId: "mail-0", via: "email", domain: "lumen-energia-pagos.com" }] }],
  flags: [],
  impostors: [],
  stated: [],
};

async function writeThree(): Promise<string> {
  const path = join(await mkdtemp(join(tmpdir(), "timo-")), "verdicts.jsonl");
  const opened = await VerdictLog.open(path, "abc1234");
  assert.ok(opened.ok);
  await opened.value.append(SWAP, { kind: "deny", rule: "payee-drift", reason: "iban drift" }, "teach-card");
  await opened.value.append(SWAP, { kind: "ask", rule: "payee-new", reason: "new iban" }, "guardian-ask");
  await opened.value.append({ ...SWAP, values: [] }, { kind: "allow" }, "none");
  return path;
}

test("an untouched log verifies", async () => {
  const checked = verifyChain(await readFile(await writeThree(), "utf8"));
  assert.ok(checked.ok);
  assert.deepEqual(checked.value.map((entry) => entry.seq), [0, 1, 2]);
  assert.equal(listVerdicts(checked.value)[0]?.rulesCommit, "abc1234");
});

test("turning a deny into an allow is caught at that entry", async () => {
  const path = await writeThree();
  const lines = (await readFile(path, "utf8")).split("\n");
  lines[0] = lines[0]!.replace('"kind":"deny"', '"kind":"allow"');
  await writeFile(path, lines.join("\n"));
  const checked = verifyChain(await readFile(path, "utf8"));
  assert.ok(!checked.ok);
  assert.equal(checked.error.line, 1);
  assert.match(checked.error.reason, /hash/);
});

test("deleting an entry is caught at the next one", async () => {
  const path = await writeThree();
  const lines = (await readFile(path, "utf8")).split("\n");
  lines.splice(1, 1);
  const checked = verifyChain(lines.join("\n"));
  assert.ok(!checked.ok);
  assert.equal(checked.error.line, 2);
});

test("reopening continues the chain", async () => {
  const path = await writeThree();
  const reopened = await VerdictLog.open(path, "abc1234");
  assert.ok(reopened.ok);
  const entry = await reopened.value.append(SWAP, { kind: "allow" }, "none");
  assert.equal(entry.seq, 3);
  assert.ok(verifyChain(await readFile(path, "utf8")).ok);
});

test("a broken log refuses to reopen", async () => {
  const path = await writeThree();
  await writeFile(path, (await readFile(path, "utf8")).replace("payee-new", "payee-old"));
  const reopened = await VerdictLog.open(path, "abc1234");
  assert.ok(!reopened.ok);
  assert.equal(reopened.error.line, 2);
});
