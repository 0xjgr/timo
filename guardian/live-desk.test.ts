import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { test } from "node:test";
import type { Blocked } from "../gate/gates.ts";
import { LEDGER, RULE_CASES } from "../policy/cases.ts";
import { openDesk } from "./live-desk.ts";

function heldPlumber(seq: number): Blocked {
  const ruleCase = RULE_CASES.find((candidate) => candidate.rule === "payee-new")!;
  return { via: "click", seq, commit: ruleCase.commit, verdict: { kind: "ask", rule: "payee-new", reason: "not in your ledger" } };
}

async function openTestDesk(timeoutMs = 60_000) {
  const desk = await openDesk({ runDir: await mkdtemp(`${tmpdir()}/desk-`), ledger: LEDGER, port: 0, timeoutMs });
  const url = new URL(desk.url);
  const base = `${url.protocol}//${url.host}`;
  const token = new URLSearchParams(url.hash.slice(1)).get("t")!;
  const post = (path: string, body: unknown, cookie = "") =>
    fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(body) });
  return { desk, base, token, post };
}

test("desk: a wrong link gets nothing and cannot answer", async () => {
  const { desk, base, post } = await openTestDesk();
  try {
    assert.equal((await post("/api/session", { token: "guess" })).status, 403);
    assert.equal((await fetch(`${base}/api/state`)).status, 401);
    assert.equal((await post("/api/answer", { seq: 0, isApproved: true })).status, 401);
  } finally {
    await desk.close();
  }
});

test("desk: the guardian sees the held payment and the answer reaches the gate", async () => {
  const { desk, base, token, post } = await openTestDesk();
  try {
    const login = await post("/api/session", { token });
    const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
    assert.match(login.headers.get("set-cookie")!, /HttpOnly; SameSite=Strict/);
    const answered = desk.ask(heldPlumber(3));
    const state = await (await fetch(`${base}/api/state`, { headers: { cookie } })).json();
    assert.equal(state.pending[0].seq, 3);
    assert.equal(state.pending[0].rule, "payee-new");
    assert.equal((await post("/api/answer", { seq: 9, isApproved: true }, cookie)).status, 409);
    assert.equal((await post("/api/answer", { seq: 3, isApproved: true }, cookie)).status, 200);
    assert.deepEqual(await answered, { isApproved: true, by: "guardian" });
  } finally {
    await desk.close();
  }
});

test("desk: evidence paths cannot leave the run folder", async () => {
  const { desk, base, token, post } = await openTestDesk();
  try {
    const cookie = (await post("/api/session", { token })).headers.get("set-cookie")!.split(";")[0]!;
    for (const path of ["/evidence/../.env", "/evidence/lens/..%2F..%2F.env", "/evidence/verdicts.jsonl"]) {
      assert.equal((await fetch(`${base}${path}`, { headers: { cookie } })).status, 404, path);
    }
  } finally {
    await desk.close();
  }
});

test("desk: silence is a no", async () => {
  const { desk } = await openTestDesk(50);
  try {
    assert.deepEqual(await desk.ask(heldPlumber(0)), { isApproved: false, by: "timeout" });
  } finally {
    await desk.close();
  }
});
