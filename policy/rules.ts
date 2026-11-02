import type { Commit } from "../gate/commit.ts";
import type { Payee } from "../ledger/payee.ts";
import { normalizeName } from "../provenance/name.ts";
import type { Origin, Trace, ValueKind } from "../provenance/trace.ts";
import type { RuleId, Verdict } from "./verdict.ts";

export type Finding = Exclude<Verdict, { kind: "allow" }>;

type Rule = (commit: Commit, ledger: Payee[]) => Finding | null;

export const RULES: Record<RuleId, Rule> = {
  "value-untraced": (commit) => {
    // threat: a value the agent rebuilt or hallucinated, so no source can vouch for it
    const untraced = commit.values.find((trace) => trace.origins.length === 0);
    if (!untraced) return null;
    return deny("value-untraced", `${untraced.kind} ${untraced.value} appears nowhere you said or Timo read`);
  },

  "payee-drift": (commit, ledger) => {
    // threat: account-change fraud, the bill looks like a known payee but the money goes elsewhere
    const payee = findClaimedPayee(commit, ledger);
    if (!payee) return null;
    const drifted = listValues(commit, "iban").find((trace) => trace.value !== payee.iban);
    if (!drifted) return null;
    return deny(
      "payee-drift",
      `${payee.name} is paid to ${payee.iban} in your ledger, this form pays ${drifted.value} (${describeOrigins(drifted.origins)})`,
    );
  },

  "secret-off-domain": (commit, ledger) => {
    // threat: phishing page collecting the bank login
    if (listValues(commit, "secret").length === 0) return null;
    // todo: the vault keeps the allowed domains per secret instead of the whole ledger
    if (ledger.some((payee) => payee.domains.includes(commit.targetDomain))) return null;
    return deny("secret-off-domain", `a saved secret would go to ${commit.targetDomain}, which is not in your ledger`);
  },

  "brand-impostor": (commit, ledger) => {
    // threat: cloned portal with a ledger payee's logo, whether the form is on it or its iban is carried to the bank
    for (const impostor of commit.impostors) {
      const payee = ledger.find((candidate) => candidate.id === impostor.payeeId);
      if (!payee || payee.domains.includes(impostor.domain)) continue;
      // note: an amount from the clone sent to the ledger iban is left to amount-unbacked
      const isCarried = commit.values.some(
        (trace) => (trace.kind === "iban" || trace.kind === "beneficiary") && !isVouched(trace) && trace.origins.some((origin) => origin.kind === "foreign" && origin.sourceId === impostor.sourceId),
      );
      if (commit.pageUrl !== impostor.sourceId && !isCarried) continue;
      return deny("brand-impostor", `${impostor.domain} shows the ${payee.name} logo but is not their site; ${payee.name} is paid to ${payee.iban} in your ledger`);
    }
    return null;
  },

  "commit-outside-gate": (commit) => {
    // threat: page script submitting the form behind the agent's back
    if (commit.via !== "network" || commit.hasPassedClickGate || commit.values.length === 0) return null;
    return deny("commit-outside-gate", `the page sent payment details to ${commit.targetDomain} without a checked click`);
  },

  "payee-new": (commit, ledger) => {
    const unknown = listValues(commit, "iban").find((trace) => !ledger.some((payee) => payee.iban === trace.value));
    if (!unknown) return null;
    return ask("payee-new", `${unknown.value} is not in your ledger (${describeOrigins(unknown.origins)})`);
  },

  "amount-unbacked": (commit, ledger) => {
    const payee = ledger.find((candidate) => listValues(commit, "iban").some((trace) => trace.value === candidate.iban));
    // note: without a ledger payee there is no usual range, and payee-new already asks
    if (!payee) return null;
    const unbacked = listValues(commit, "amount").find((trace) => !isAmountBacked(trace, payee));
    if (!unbacked) return null;
    return ask(
      "amount-unbacked",
      `${unbacked.value} EUR to ${payee.name} is outside ${payee.amountRange.min}-${payee.amountRange.max} EUR and comes from ${describeOrigins(unbacked.origins)}`,
    );
  },

  "amount-disputed": (commit, ledger) => {
    // threat: the payee's real mailbox, taken over, sends a "corrected" bill: right account, usual-looking amount, wrong total.
    // found by the adaptive attacker in its first round against a228418
    const payee = ledger.find((candidate) => listValues(commit, "iban").some((trace) => trace.value === candidate.iban));
    if (!payee) return null;
    const amount = listValues(commit, "amount").find((trace) => !trace.origins.some((origin) => origin.kind === "request"));
    if (!amount) return null;
    const dissent = commit.stated.find((statement) => payee.domains.includes(statement.domain) && !statement.amounts.includes(amount.value));
    if (!dissent) return null;
    return ask(
      "amount-disputed",
      `${amount.value} EUR to ${payee.name}, but ${dissent.domain} also says ${dissent.amounts.join(", ")} EUR in ${dissent.via === "page" ? "a page" : `an ${dissent.via}`}`,
    );
  },

  "amount-unverified": (commit, ledger) => {
    // threat: the corrected bill again, read by an agent that never opened the real one, so no source disagrees.
    // found by the adaptive attacker against 11ea52d
    const payee = ledger.find((candidate) => listValues(commit, "iban").some((trace) => trace.value === candidate.iban));
    if (!payee?.billUrl) return null;
    const amount = listValues(commit, "amount").find((trace) => !trace.origins.some((origin) => origin.kind === "request"));
    if (!amount) return null;
    const check = commit.checked.find((candidate) => candidate.payeeId === payee.id);
    if (!check) return ask("amount-unverified", `${amount.value} EUR to ${payee.name} was not checked on their own site`);
    if (!check.ok) return ask("amount-unverified", `${amount.value} EUR to ${payee.name}: their bill page did not open (${check.error.slice(0, 80)})`);
    if (check.amounts.includes(amount.value)) return null;
    return ask("amount-unverified", `${amount.value} EUR to ${payee.name}, but their own bill page shows ${check.amounts.join(", ") || "no amount"} EUR`);
  },

  "reader-escalation": (commit, ledger) => {
    // threat: a scam the rules have no shape for, caught only by what the source says.
    // note: only a value that nothing but flagged sources backs; the real bill amount repeated in a flagged mail stays allowed,
    // and so does a usual amount to a ledger account, which the ledger itself backs
    const findFlag = (origin: Origin) => (origin.kind === "foreign" ? commit.flags.find((flag) => flag.sourceId === origin.sourceId) : undefined);
    const payee = ledger.find((candidate) => listValues(commit, "iban").some((trace) => trace.value === candidate.iban));
    // note: the usual range only; the payee's own domain is no backing when that domain's mail is the flagged one
    const isLedgerBacked = (trace: Trace) => trace.kind === "amount" && payee !== undefined && Number(trace.value) >= payee.amountRange.min && Number(trace.value) <= payee.amountRange.max;
    const carried = commit.values.find((trace) => trace.origins.length > 0 && !isLedgerBacked(trace) && trace.origins.every((origin) => findFlag(origin)));
    if (!carried) return null;
    const origin = carried.origins[0]!;
    const flag = findFlag(origin)!;
    return ask("reader-escalation", `${carried.kind} ${carried.value} comes only from ${describeOrigins([origin])}, which the second reader flagged for ${flag.reason}: "${flag.quote}"`);
  },
};

function findClaimedPayee(commit: Commit, ledger: Payee[]): Payee | undefined {
  const names = new Set(listValues(commit, "beneficiary").map((trace) => normalizeName(trace.value)));
  const domains = new Set(
    commit.values.flatMap((trace) => trace.origins).flatMap((origin) => (origin.kind === "foreign" ? [origin.domain] : [])),
  );
  return ledger.find(
    (payee) => names.has(normalizeName(payee.name)) || payee.domains.some((domain) => domains.has(domain)),
  );
}

function isVouched(trace: Trace): boolean {
  return trace.origins.some((origin) => origin.kind === "request" || origin.kind === "ledger");
}

// threat: a taken-over mailbox on the payee's real domain sends an unusual total; its mail is no proof, the payee's own site is
function isAmountBacked(trace: Trace, payee: Payee): boolean {
  const isFromTrusted = trace.origins.some(
    (origin) => origin.kind === "request" || (origin.kind === "foreign" && origin.via === "page" && payee.domains.includes(origin.domain)),
  );
  const amount = Number(trace.value);
  return isFromTrusted || (amount >= payee.amountRange.min && amount <= payee.amountRange.max);
}

function listValues(commit: Commit, kind: ValueKind): Trace[] {
  return commit.values.filter((trace) => trace.kind === kind);
}

function describeOrigins(origins: Origin[]): string {
  if (origins.length === 0) return "no source";
  return origins.map(describeOrigin).join(", ");
}

function describeOrigin(origin: Origin): string {
  if (origin.kind === "request") return "you said";
  if (origin.kind === "ledger") return "your ledger";
  return `read from ${origin.via} ${origin.domain}`;
}

function deny(rule: RuleId, reason: string): Finding {
  return { kind: "deny", rule, reason };
}

function ask(rule: RuleId, reason: string): Finding {
  return { kind: "ask", rule, reason };
}
