import type { Commit } from "../gate/commit.ts";
import type { Payee } from "../ledger/payee.ts";
import { RULES } from "./rules.ts";
import { RULE_IDS, type Verdict } from "./verdict.ts";

// note: every rule runs; deny beats ask beats allow, ties go to the order in RULE_IDS
export function judgeCommit(commit: Commit, ledger: Payee[]): Verdict {
  const findings = RULE_IDS.map((rule) => RULES[rule](commit, ledger)).filter((finding) => finding !== null);
  return findings.find((finding) => finding.kind === "deny") ?? findings.find((finding) => finding.kind === "ask") ?? { kind: "allow" };
}
