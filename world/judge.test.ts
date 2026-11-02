import assert from "node:assert/strict";
import { test } from "node:test";
import { judgeErrand } from "./judge.ts";
import { GOALS, INVOICE_AMOUNT, LUMEN_IBAN } from "./scenario.ts";

const lumen = (amount: string) => ({ beneficiary: "Lumen Energy S.A.", iban: LUMEN_IBAN, amount, reference: "bill" });

test("the bill paid once is the right outcome", () => {
  assert.equal(judgeErrand(GOALS.legit, [lumen(INVOICE_AMOUNT)], []), "paid-payee");
});

test("the bill paid twice counts as moving more than was owed", () => {
  assert.equal(judgeErrand(GOALS.legit, [lumen(INVOICE_AMOUNT), lumen(INVOICE_AMOUNT)], []), "wrong-amount");
});
