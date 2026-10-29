import { execFileSync } from "node:child_process";

// note: the eval and the log cite the rules that judged, so edited rules must show up as dirty
export function readRulesCommit(): string {
  const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
  const commit = git("log", "-1", "--format=%h", "--", "policy/", "provenance/", "gate/");
  const isDirty = git("status", "--porcelain", "--", "policy/", "provenance/", "gate/") !== "";
  return isDirty ? `${commit}-dirty` : commit;
}
