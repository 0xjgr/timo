import type { Trace } from "../provenance/trace.ts";

export type Commit = {
  via: "click" | "network";
  // threat: js auto-submit that never went through a click
  hasPassedClickGate: boolean;
  pageDomain: string;
  targetDomain: string;
  values: Trace[];
  impostorOf?: string;
  flaggedSourceIds: string[];
};
