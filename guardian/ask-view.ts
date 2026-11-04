import type { Blocked } from "../gate/gates.ts";
import type { Payee } from "../ledger/payee.ts";
import type { SourceVia } from "../provenance/trace.ts";
import type { ReaderReason } from "../reader/read-source.ts";
import { collectFacts } from "../teach/verdict-facts.ts";

export type AskView = {
  seq: number;
  rule: string;
  reason: string;
  scam: string;
  beneficiary?: string;
  payeeName?: string;
  payeePhone?: string;
  knownAccountEnd?: string;
  formAccountEnd?: string;
  amount?: string;
  sourceVia?: SourceVia;
  sourceDomain?: string;
  flags: { reason: ReaderReason; quote: string }[];
  askedAt: string;
  expiresAt: string;
  lensHref?: string;
};

const MAX_TEXT = 240;

// note: beneficiary and quotes are attacker-written text; they are cut short here and escaped where drawn
export function buildAskView(block: Blocked, ledger: Payee[], timeoutMs: number, lensHref?: string): AskView {
  const facts = collectFacts(block.verdict, block.commit, ledger);
  const beneficiary = block.commit.values.find((trace) => trace.kind === "beneficiary")?.value;
  const now = Date.now();
  return {
    seq: block.seq,
    rule: block.verdict.rule,
    reason: block.verdict.reason.slice(0, MAX_TEXT),
    scam: facts.scam,
    beneficiary: beneficiary?.slice(0, 80),
    payeeName: facts.payeeName,
    // note: the number to call comes from the ledger the family wrote, never from the message
    payeePhone: ledger.find((payee) => payee.name === facts.payeeName)?.phone,
    knownAccountEnd: facts.knownAccountEnd,
    formAccountEnd: facts.formAccountEnd,
    amount: facts.amount,
    sourceVia: facts.sourceVia,
    sourceDomain: facts.sourceDomain,
    flags: block.commit.flags.map((flag) => ({ reason: flag.reason, quote: flag.quote.slice(0, MAX_TEXT) })),
    askedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + timeoutMs).toISOString(),
    lensHref,
  };
}
