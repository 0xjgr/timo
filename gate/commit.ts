import type { BillCheck, Statement, Trace } from "../provenance/trace.ts";
import type { ReaderFlag } from "../reader/read-source.ts";

export type Impostor = { sourceId: string; payeeId: string; domain: string };

export type Commit = {
  via: "click" | "network";
  // threat: js auto-submit that never went through a click
  hasPassedClickGate: boolean;
  pageUrl: string;
  pageDomain: string;
  targetDomain: string;
  values: Trace[];
  // note: every source the brand check caught showing a ledger logo off the payee's domains
  impostors: Impostor[];
  // note: second reader flags on the sources this commit's values came from
  flags: ReaderFlag[];
  // note: the amounts each source the agent read states, not only the ones in this form
  stated: Statement[];
  checked: BillCheck[];
};
