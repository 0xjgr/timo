import { createHash } from "node:crypto";
import { appendFile, readFile } from "node:fs/promises";
import type { Verdict } from "../policy/verdict.ts";
import type { Commit } from "./commit.ts";

export type FollowUp = "none" | "guardian-notice" | "teach-card" | "guardian-ask";

export type VerdictEntry = {
  seq: number;
  at: string;
  rulesCommit: string;
  commit: Commit;
  verdict: Verdict;
  followUp: FollowUp;
  prevHash: string;
  hash: string;
};

export type ChainBreak = { seq: number; line: number; reason: string };

const GENESIS = "0".repeat(64);

// note: hash over the exact json written, so verify only needs the line minus its hash field
function hashEntry(unsealed: Omit<VerdictEntry, "hash">): string {
  return createHash("sha256").update(JSON.stringify(unsealed)).digest("hex");
}

// note: owns the chain head, so appends from both gates stay in order
export class VerdictLog {
  readonly #path: string;
  readonly #rulesCommit: string;
  #seq: number;
  #head: string;
  #queue: Promise<unknown> = Promise.resolve();

  private constructor(path: string, rulesCommit: string, seq: number, head: string) {
    this.#path = path;
    this.#rulesCommit = rulesCommit;
    this.#seq = seq;
    this.#head = head;
  }

  // threat: resuming on a broken file would extend a chain that already lies
  static async open(path: string, rulesCommit: string): Promise<{ ok: true; value: VerdictLog } | { ok: false; error: ChainBreak }> {
    const text = await readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return "";
      throw error;
    });
    const checked = verifyChain(text);
    if (!checked.ok) return checked;
    const last = checked.value.at(-1);
    return { ok: true, value: new VerdictLog(path, rulesCommit, last ? last.seq + 1 : 0, last ? last.hash : GENESIS) };
  }

  append(commit: Commit, verdict: Verdict, followUp: FollowUp): Promise<VerdictEntry> {
    const unsealed: Omit<VerdictEntry, "hash"> = {
      seq: this.#seq++,
      at: new Date().toISOString(),
      rulesCommit: this.#rulesCommit,
      commit,
      verdict,
      followUp,
      prevHash: this.#head,
    };
    const entry: VerdictEntry = { ...unsealed, hash: hashEntry(unsealed) };
    this.#head = entry.hash;
    const written = this.#queue.then(() => appendFile(this.#path, `${JSON.stringify(entry)}\n`));
    this.#queue = written;
    return written.then(() => entry);
  }
}

export function verifyChain(text: string): { ok: true; value: VerdictEntry[] } | { ok: false; error: ChainBreak } {
  const entries: VerdictEntry[] = [];
  let head = GENESIS;
  const lines = text.split("\n").filter((line) => line.trim() !== "");
  for (const [index, line] of lines.entries()) {
    const fail = (reason: string) => ({ ok: false as const, error: { seq: index, line: index + 1, reason } });
    let entry: VerdictEntry;
    try {
      entry = JSON.parse(line) as VerdictEntry;
    } catch {
      return fail("not json");
    }
    if (entry.seq !== index) return fail(`seq ${entry.seq}, expected ${index}`);
    if (entry.prevHash !== head) return fail("prevHash does not match the entry before");
    const { hash, ...unsealed } = entry;
    if (hashEntry(unsealed) !== hash) return fail("content does not match its hash");
    head = hash;
    entries.push(entry);
  }
  return { ok: true, value: entries };
}
