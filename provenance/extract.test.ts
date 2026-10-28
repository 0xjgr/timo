import assert from "node:assert/strict";
import { test } from "node:test";
import { ATTACKER_IBAN, LUMEN_IBAN } from "../world/scenario.ts";
import { extractAmounts, normalizeAmount } from "./amount.ts";
import { domainOfAddress, registrableDomain } from "./domain.ts";
import { compactIban, extractIbans, isValidIban } from "./iban.ts";
import { normalizeName } from "./name.ts";

test("world ibans pass mod-97 and a one digit change fails", () => {
  assert.ok(isValidIban(compactIban(LUMEN_IBAN)));
  assert.ok(isValidIban(compactIban(ATTACKER_IBAN)));
  assert.equal(isValidIban(compactIban(LUMEN_IBAN).replace(/2$/, "3")), false);
});

test("ibans come out of table text, printed or compact, upper or lower case", () => {
  const text = `IBAN\t${LUMEN_IBAN}\nReference\tLE-2026-10-4471\nalt ${compactIban(ATTACKER_IBAN).toLowerCase()}.`;
  assert.deepEqual(extractIbans(text), [compactIban(LUMEN_IBAN), compactIban(ATTACKER_IBAN)]);
});

test("two ibans on one line are both found", () => {
  assert.equal(extractIbans(`${LUMEN_IBAN} or ${ATTACKER_IBAN}`).length, 2);
});

test("a longer token that starts like an iban is not extracted", () => {
  assert.deepEqual(extractIbans(`${compactIban(LUMEN_IBAN)}77`), []);
});

test("amounts normalize from both decimal styles", () => {
  assert.equal(normalizeAmount("84,20"), "84.20");
  assert.equal(normalizeAmount("84.20"), "84.20");
  assert.equal(normalizeAmount("1.912,45"), "1912.45");
  assert.equal(normalizeAmount("1,912.45"), "1912.45");
  assert.equal(normalizeAmount("900"), "900.00");
  assert.equal(normalizeAmount("84.2"), null);
  assert.equal(normalizeAmount("84 EUR"), null);
});

test("amounts need cents or a currency, so dates and refs stay out", () => {
  const text = "Amount due 84.20 EUR. Due Nov 10, 2026. Contract 4471-ELEC. Send 900 euros. Or €65";
  assert.deepEqual(extractAmounts(text).sort(), ["65.00", "84.20", "900.00"]);
});

test("registrable domain ignores subdomains and keeps public suffixes", () => {
  assert.equal(registrableDomain("https://clientes.lumen-energy.es/factura"), "lumen-energy.es");
  assert.equal(registrableDomain("lumen-energy.es.pagos.com"), "pagos.com");
  assert.equal(registrableDomain("billing.example.co.uk"), "example.co.uk");
  assert.equal(domainOfAddress("facturas@lumen-energia-pagos.com"), "lumen-energia-pagos.com");
});

test("payee names match across case, accents and legal form", () => {
  assert.equal(normalizeName("Lumen Energy S.A."), normalizeName("lumen energy"));
  assert.equal(normalizeName("Fontanería Ruiz, S.L."), "fontaneria ruiz");
});
