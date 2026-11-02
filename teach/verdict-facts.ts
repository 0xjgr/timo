import type { Commit } from "../gate/commit.ts";
import type { Payee } from "../ledger/payee.ts";
import type { Origin, SourceVia, Trace } from "../provenance/trace.ts";
import type { RuleId, Verdict } from "../policy/verdict.ts";

// note: the only things the explainer ever sees; built by code, never copied from a source's text
export type VerdictFacts = {
  kind: "ask" | "deny";
  rule: RuleId;
  scam: string;
  payeeName?: string;
  knownAccountEnd?: string;
  formAccountEnd?: string;
  amount?: string;
  sourceVia?: SourceVia;
  sourceDomain?: string;
};

const SCAMS: Record<RuleId, (payee?: string) => string> = {
  "payee-drift": (payee) => `a bill that looks like ${payee ?? "a company you pay"} but sends the money to a different account`,
  "brand-impostor": (payee) => `a copy of the ${payee ?? "company"} website made to look real`,
  "payee-new": () => "an account you have never paid before",
  "amount-unbacked": (payee) => (payee ? `an amount much higher than your usual ${payee} bills` : "an amount much higher than your usual bills"),
  "amount-disputed": (payee) => `two messages from ${payee ?? "the company"} that ask for different amounts`,
  "payee-repeat": (payee) => `a request to pay ${payee ?? "the same company"} a second time for one bill`,
  "amount-unverified": (payee) => `a bill amount that ${payee ?? "the company"}'s own website does not show`,
  "value-untraced": () => "payment details that come from nowhere you or Timo can check",
  "secret-off-domain": () => "a site asking for your bank password that is not your bank",
  "commit-outside-gate": () => "a page that tried to send the payment by itself",
  "reader-escalation": () => "a message that tries to change who gets paid",
};

export function collectFacts(verdict: Exclude<Verdict, { kind: "allow" }>, commit: Commit, ledger: Payee[]): VerdictFacts {
  const ibans = commit.values.filter((trace) => trace.kind === "iban");
  const payee = findPayee(commit, ledger);
  const formIban = ibans.find((trace) => trace.value !== payee?.iban) ?? ibans[0];
  const amount = commit.values.find((trace) => trace.kind === "amount");
  const culprit = ["amount-unbacked", "amount-disputed", "amount-unverified", "payee-repeat"].includes(verdict.rule) ? amount : formIban;
  const origin = findForeign(culprit);
  const impostor = verdict.rule === "brand-impostor" ? commit.impostors[0] : undefined;
  return {
    kind: verdict.kind,
    rule: verdict.rule,
    scam: SCAMS[verdict.rule](payee?.name),
    payeeName: payee?.name,
    knownAccountEnd: payee ? payee.iban.slice(-4) : undefined,
    formAccountEnd: formIban && /^[A-Z0-9]+$/.test(formIban.value) ? formIban.value.slice(-4) : undefined,
    amount: amount && /^\d{1,7}(\.\d{1,2})?$/.test(amount.value) ? amount.value : undefined,
    sourceVia: impostor ? "page" : origin?.via,
    sourceDomain: cleanDomain(impostor?.domain ?? origin?.domain),
  };
}

function findPayee(commit: Commit, ledger: Payee[]): Payee | undefined {
  const ledgerIds = commit.values.flatMap((trace) => trace.origins).flatMap((origin) => (origin.kind === "ledger" ? [origin.payeeId] : []));
  const impostorIds = commit.impostors.map((impostor) => impostor.payeeId);
  return ledger.find((payee) => ledgerIds.includes(payee.id) || impostorIds.includes(payee.id));
}

function findForeign(trace?: Trace): Extract<Origin, { kind: "foreign" }> | undefined {
  return trace?.origins.find((origin): origin is Extract<Origin, { kind: "foreign" }> => origin.kind === "foreign");
}

// threat: a domain is attacker-chosen text; only a plain hostname may reach the explainer
function cleanDomain(domain?: string): string | undefined {
  return domain && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain) && domain.length <= 80 ? domain : undefined;
}
