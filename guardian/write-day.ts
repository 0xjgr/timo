import { access, readFile, writeFile } from "node:fs/promises";
import { isDecision, listVerdicts, verifyChain, type LogEntry } from "../gate/verdict-log.ts";
import type { Payee } from "../ledger/payee.ts";
import { renderDay, type ChainState, type GuardianDay } from "./render-day.ts";

// note: entries up to a break still render, so the guardian sees where the log stops being trustworthy
export async function writeDay(runDir: string, ledger: Payee[], title: string): Promise<string> {
  const text = await readFile(`${runDir}/verdicts.jsonl`, "utf8").catch(() => "");
  const checked = verifyChain(text);
  const lines = text.split("\n").filter((line) => line.trim() !== "");
  const chain: ChainState = checked.ok
    ? { ok: true, head: checked.value.at(-1)?.hash ?? "0".repeat(64) }
    : { ok: false, line: checked.error.line, reason: checked.error.reason };
  const trusted: LogEntry[] = checked.ok ? checked.value : lines.slice(0, checked.error.line - 1).map((line) => JSON.parse(line) as LogEntry);
  const decisions = trusted.filter(isDecision);
  const entries: GuardianDay["entries"] = [];
  for (const entry of listVerdicts(trusted)) {
    entries.push({
      entry,
      answer: decisions.find((decision) => decision.decision.forSeq === entry.seq)?.decision,
      lensHref: await findFile(runDir, `lens/verdict-${entry.seq}.html`),
      cardHref: await findFile(runDir, `teach/card-${entry.seq}.html`),
    });
  }
  const file = `${runDir}/guardian.html`;
  await writeFile(file, renderDay({ title, chain, entries, ledger }));
  console.log(`[guardian] wrote ${file} entries=${entries.length} chain=${chain.ok ? "intact" : `broken line=${chain.line}`}`);
  return file;
}

async function findFile(runDir: string, relative: string): Promise<string | undefined> {
  return access(`${runDir}/${relative}`).then(() => relative, () => undefined);
}
