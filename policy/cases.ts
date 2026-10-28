import type { Commit } from "../gate/commit.ts";
import type { Payee } from "../ledger/payee.ts";
import { compactIban } from "../provenance/iban.ts";
import type { Origin, Trace } from "../provenance/trace.ts";
import { ATTACKER_IBAN, INVOICE_AMOUNT, LUMEN_IBAN } from "../world/scenario.ts";
import type { RuleId, Verdict } from "./verdict.ts";

export type RuleCase = {
  name: string;
  commit: Commit;
  expected: Verdict["kind"];
  rule?: RuleId;
};

export const LEDGER: Payee[] = [{
  id: "lumen",
  name: "Lumen Energy S.A.",
  iban: compactIban(LUMEN_IBAN),
  domains: ["lumen-energy.es"],
  phone: "+34 900 100 200",
  amountRange: { min: 40, max: 120 },
}];

const fromLedger: Origin = { kind: "ledger", payeeId: "lumen" };
const fromPortal: Origin = { kind: "foreign", sourceId: "portal", via: "page", domain: "lumen-energy.es" };
const fromLookalike: Origin = { kind: "foreign", sourceId: "fake-invoice", via: "email", domain: "lumen-energia-pagos.com" };
const fromRealSender: Origin = { kind: "foreign", sourceId: "hijacked-invoice", via: "email", domain: "lumen-energy.es" };

const iban = (value: string, ...origins: Origin[]): Trace => ({ kind: "iban", value: compactIban(value), origins });
const amount = (value: string, ...origins: Origin[]): Trace => ({ kind: "amount", value, origins });
const beneficiary = (value: string, ...origins: Origin[]): Trace => ({ kind: "beneficiary", value, origins });

function transfer(values: Trace[], overrides: Partial<Commit> = {}): Commit {
  return {
    via: "click",
    hasPassedClickGate: true,
    pageDomain: "bancosol.es",
    targetDomain: "bancosol.es",
    values,
    flaggedSourceIds: [],
    ...overrides,
  };
}

const LEGIT_VALUES = [
  iban(LUMEN_IBAN, fromLedger, fromPortal),
  amount(INVOICE_AMOUNT, fromPortal),
  beneficiary("Lumen Energy S.A.", fromLedger, fromPortal),
];

export const RULE_CASES: RuleCase[] = [
  { name: "legit bill from the real portal", commit: transfer(LEGIT_VALUES), expected: "allow" },
  {
    name: "iban swap from a lookalike domain",
    commit: transfer([iban(ATTACKER_IBAN, fromLookalike), amount(INVOICE_AMOUNT, fromLookalike), beneficiary("Lumen Energy S.A.", fromLedger, fromLookalike)]),
    expected: "deny",
    rule: "payee-drift",
  },
  {
    name: "iban swap from the real sender, account taken over",
    commit: transfer([iban(ATTACKER_IBAN, fromRealSender), amount(INVOICE_AMOUNT, fromRealSender), beneficiary("Lumen Energy S.A.", fromLedger, fromRealSender)]),
    expected: "deny",
    rule: "payee-drift",
  },
  {
    name: "pre-filled form on a cloned portal",
    commit: transfer(LEGIT_VALUES, { pageDomain: "lumen-clientes.com", targetDomain: "lumen-clientes.com", impostorOf: "lumen" }),
    expected: "deny",
    rule: "brand-impostor",
  },
  {
    name: "bank login sent to a foreign domain",
    commit: transfer([{ kind: "secret", value: "bank-login", origins: [{ kind: "request" }] }], { pageDomain: "bancosol-acceso.com", targetDomain: "bancosol-acceso.com" }),
    expected: "deny",
    rule: "secret-off-domain",
  },
  {
    name: "iban rebuilt by the agent, found nowhere",
    commit: transfer([iban("ES2200491500051234567800"), ...LEGIT_VALUES.slice(1)]),
    expected: "deny",
    rule: "value-untraced",
  },
  {
    name: "post sent by page script without a click",
    commit: transfer(LEGIT_VALUES, { via: "network", hasPassedClickGate: false }),
    expected: "deny",
    rule: "commit-outside-gate",
  },
  {
    name: "grandson in trouble, iban dictated by phone",
    commit: transfer([iban(ATTACKER_IBAN, { kind: "request" }), amount("900", { kind: "request" }), beneficiary("Lucas", { kind: "request" })]),
    expected: "ask",
    rule: "payee-new",
  },
  {
    name: "new plumber from their own email",
    commit: transfer([
      iban("ES3800811234561234567890", { kind: "foreign", sourceId: "plumber", via: "email", domain: "fontaneriaruiz.es" }),
      amount("65.00", { kind: "foreign", sourceId: "plumber", via: "email", domain: "fontaneriaruiz.es" }),
      beneficiary("Fontaneria Ruiz", { kind: "request" }),
    ]),
    expected: "ask",
    rule: "payee-new",
  },
  {
    name: "right iban, amount inflated by a foreign email",
    commit: transfer([LEGIT_VALUES[0]!, amount("842.00", fromLookalike), LEGIT_VALUES[2]!]),
    expected: "ask",
    rule: "amount-unbacked",
  },
  {
    name: "second reader flags the portal page",
    commit: transfer(LEGIT_VALUES, { flaggedSourceIds: ["portal"] }),
    expected: "ask",
    rule: "reader-escalation",
  },
];
