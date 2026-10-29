import type { Trace } from "../provenance/trace.ts";

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
  flaggedSourceIds: string[];
};
