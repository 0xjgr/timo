import type { Commit } from "../gate/commit.ts";
import { HOUSEHOLD_LEDGER } from "../ledger/household.ts";
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

export const LEDGER: Payee[] = HOUSEHOLD_LEDGER;

const fromLedger: Origin = { kind: "ledger", payeeId: "lumen" };
const fromPortal: Origin = { kind: "foreign", sourceId: "portal", via: "page", domain: "lumen-energy.es" };
const fromLookalike: Origin = { kind: "foreign", sourceId: "fake-invoice", via: "email", domain: "lumen-energia-pagos.com" };
const fromRealSender: Origin = { kind: "foreign", sourceId: "hijacked-invoice", via: "email", domain: "lumen-energy.es" };
const fromClone: Origin = { kind: "foreign", sourceId: "clone-portal", via: "page", domain: "lumen-energia-pagos.com" };
const CLONE_IMPOSTOR = { sourceId: "clone-portal", payeeId: "lumen", domain: "lumen-energia-pagos.com" };

const iban = (value: string, ...origins: Origin[]): Trace => ({ kind: "iban", value: compactIban(value), origins });
const amount = (value: string, ...origins: Origin[]): Trace => ({ kind: "amount", value, origins });
const beneficiary = (value: string, ...origins: Origin[]): Trace => ({ kind: "beneficiary", value, origins });

function transfer(values: Trace[], overrides: Partial<Commit> = {}): Commit {
  return {
    via: "click",
    hasPassedClickGate: true,
    pageUrl: "http://bancosol.es/bank",
    pageDomain: "bancosol.es",
    targetDomain: "bancosol.es",
    values,
    flags: [],
    impostors: [],
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
    commit: transfer(LEGIT_VALUES, { pageDomain: "lumen-clientes.com", targetDomain: "lumen-clientes.com", pageUrl: "http://lumen-clientes.com/pay", impostors: [{ sourceId: "http://lumen-clientes.com/pay", payeeId: "lumen", domain: "lumen-clientes.com" }] }),
    expected: "deny",
    rule: "brand-impostor",
  },
  {
    name: "iban copied from a cloned portal, paid at the real bank",
    commit: transfer([iban(ATTACKER_IBAN, fromClone), amount(INVOICE_AMOUNT, fromClone), beneficiary("LE Cobros S.L.", fromClone)], {
      impostors: [CLONE_IMPOSTOR],
    }),
    expected: "deny",
    rule: "brand-impostor",
  },
  {
    name: "ledger iban after a clone was caught, amount read on the clone",
    commit: transfer([iban(LUMEN_IBAN, fromLedger), amount(INVOICE_AMOUNT, fromClone), beneficiary("Lumen Energy S.A.", fromLedger, fromClone)], {
      impostors: [CLONE_IMPOSTOR],
    }),
    expected: "allow",
  },
  {
    name: "same cloned portal, brand check off: only a new payee",
    commit: transfer([iban(ATTACKER_IBAN, fromClone), amount(INVOICE_AMOUNT, fromClone), beneficiary("LE Cobros S.L.", fromClone)]),
    expected: "ask",
    rule: "payee-new",
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
    name: "the real sender's taken-over mailbox asks for ten times the bill, and only the reader sees the pressure",
    commit: transfer([LEGIT_VALUES[0]!, amount("842.00", fromRealSender), LEGIT_VALUES[2]!], {
      flags: [{ sourceId: "hijacked-invoice", reason: "pressure", quote: "pay today to avoid disconnection" }],
    }),
    expected: "ask",
    rule: "reader-escalation",
  },
  {
    name: "the real bill amount also appears in a flagged mail from the real sender",
    commit: transfer([LEGIT_VALUES[0]!, amount(INVOICE_AMOUNT, fromRealSender, fromPortal), LEGIT_VALUES[2]!], {
      flags: [{ sourceId: "hijacked-invoice", reason: "payment-change", quote: "Lumen Energy now collects payments through a new bank" }],
    }),
    expected: "allow",
  },
  {
    name: "a usual amount to the ledger account, read only from a flagged mail",
    commit: transfer([LEGIT_VALUES[0]!, amount(INVOICE_AMOUNT, fromLookalike), LEGIT_VALUES[2]!], {
      flags: [{ sourceId: "fake-invoice", reason: "payment-change", quote: "only accepts transfers to the account below" }],
    }),
    expected: "allow",
  },
  {
    name: "an unusual amount read only from a flagged mail still asks",
    commit: transfer([LEGIT_VALUES[0]!, amount("842.00", fromLookalike), LEGIT_VALUES[2]!], {
      flags: [{ sourceId: "fake-invoice", reason: "pressure", quote: "pay today to avoid disconnection" }],
    }),
    expected: "ask",
    rule: "amount-unbacked",
  },
];
