import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { LUMEN_IBAN, PLUMBER_IBAN } from "../world/scenario.ts";
import { openLedgerBook } from "./ledger-book.ts";

test("ledger book: a known payee cannot come back with a new account", async () => {
  const book = await openLedgerBook();
  const again = await book.addPayee({ name: "Lumen Energy S.A.", iban: PLUMBER_IBAN, phone: "+34 900 000 000" });
  assert.equal(again.ok, false);
  const sameAccount = await book.addPayee({ name: "Lumen Cobros", iban: LUMEN_IBAN, phone: "+34 900 000 000" });
  assert.equal(sameAccount.ok, false);
  assert.equal(book.payees.length, 1);
});

test("ledger book: an addition is saved and read back", async () => {
  const path = `${await mkdtemp(`${tmpdir()}/ledger-`)}/ledger.json`;
  const book = await openLedgerBook(path);
  const added = await book.addPayee({ name: "Jaime Ortega Gil", iban: PLUMBER_IBAN, domain: "fontaneriaortega.es", phone: "+34 600 123 456", amount: 135 });
  assert.ok(added.ok);
  assert.deepEqual(added.value.amountRange, { min: 1, max: 203 });
  const reopened = await openLedgerBook(path);
  assert.deepEqual(reopened.payees.map((payee) => payee.id), ["lumen", "jaime-ortega-gil"]);
  assert.match(await readFile(path, "utf8"), /fontaneriaortega\.es/);
});
