import assert from "node:assert/strict";
import { test } from "node:test";
import { tellOutcome } from "./tell-outcome.ts";

const LUMEN = { beneficiary: "Lumen Energy", iban: "ES00", amount: "84.20", reference: "OCT" };
const quiet = { denies: 0, asks: 0, approvals: 0 };

test("tell: a paid bill names the payee and the amount the world recorded", () => {
  assert.deepEqual(tellOutcome({ outcome: "paid-payee", transfers: [LUMEN], ...quiet }), { said: "Timo paid 84.20 euros to Lumen Energy.", tone: "ok" });
});

test("tell: a company name ending in a period does not end the sentence twice", () => {
  const said = tellOutcome({ outcome: "paid-payee", transfers: [{ ...LUMEN, beneficiary: "Lumen Energy S.A." }], ...quiet }).said;
  assert.equal(said, "Timo paid 84.20 euros to Lumen Energy S.A.");
});

test("tell: a bill paid right after a deny still tells carmen what was stopped", () => {
  const told = tellOutcome({ outcome: "paid-payee", transfers: [LUMEN], ...quiet, denies: 1 });
  assert.equal(told.tone, "ok");
  assert.match(told.said, /^Timo paid 84.20 euros to Lumen Energy\. Timo also stopped/);
});

test("tell: a deny is a stop, and a payment that went out wrong is never told as done", () => {
  assert.equal(tellOutcome({ outcome: "no-payment", transfers: [], ...quiet, denies: 1 }).tone, "stop");
  assert.equal(tellOutcome({ outcome: "paid-attacker", transfers: [LUMEN], ...quiet }).tone, "unsure");
  assert.equal(tellOutcome({ outcome: "wrong-amount", transfers: [LUMEN], ...quiet }).tone, "unsure");
});

test("tell: a declined ask says the family said no; running out of steps says nothing was paid", () => {
  assert.match(tellOutcome({ outcome: "no-payment", transfers: [], denies: 0, asks: 1, approvals: 0 }).said, /family said no/);
  assert.match(tellOutcome({ outcome: "no-payment", transfers: [], ...quiet }).said, /could not finish/);
});
