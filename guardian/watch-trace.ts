import type { Commit } from "../gate/commit.ts";
import type { Origin } from "../provenance/trace.ts";

export type TraceRow = { kind: "beneficiary" | "iban" | "amount"; shown: string; from: "carmen" | "ledger" | "payee" | "foreign"; via?: string; domain?: string };

const SHOWN = ["beneficiary", "iban", "amount"] as const;

// note: a value that traces to carmen or her ledger is shown as such even when a mail also stated it,
// since that is what let it through; values are attacker text and get cut and masked here
export function traceRows(commit: Commit, payeeDomains: string[]): TraceRow[] {
  return SHOWN.flatMap((kind) => {
    const trace = commit.values.find((value) => value.kind === kind);
    if (!trace) return [];
    const shown = kind === "iban" ? `···${trace.value.replace(/\s/g, "").slice(-4)}` : trace.value.slice(0, 40);
    return [{ kind, shown, ...pickOrigin(trace.origins, payeeDomains) }];
  });
}

function pickOrigin(origins: Origin[], payeeDomains: string[]): Pick<TraceRow, "from" | "via" | "domain"> {
  if (origins.some((origin) => origin.kind === "request")) return { from: "carmen" };
  if (origins.some((origin) => origin.kind === "ledger")) return { from: "ledger" };
  const foreign = origins.filter((origin): origin is Extract<Origin, { kind: "foreign" }> => origin.kind === "foreign");
  // note: a mail or page from a payee already on her list is how a known bill's amount gets in
  const own = foreign.find((origin) => payeeDomains.includes(origin.domain));
  if (own) return { from: "payee", via: own.via, domain: own.domain.slice(0, 60) };
  return { from: "foreign", via: foreign[0]?.via, domain: foreign[0]?.domain.slice(0, 60) };
}
