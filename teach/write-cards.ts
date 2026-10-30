import { mkdir, readFile, writeFile } from "node:fs/promises";
import { verifyChain } from "../gate/verdict-log.ts";
import type { Payee } from "../ledger/payee.ts";
import { explainVerdict, type Explanation } from "./explain-verdict.ts";
import { renderCard } from "./render-card.ts";
import { collectFacts, type VerdictFacts } from "./verdict-facts.ts";

export type CardsWritten = { ok: true; value: { files: string[]; spentUsd: number } } | { ok: false; error: string };

// threat: a card read from an edited log would teach carmen a story timo never decided, so the chain is checked first
export async function writeCards(
  runDir: string,
  ledger: Payee[],
  explain: (facts: VerdictFacts) => Promise<Explanation> = explainVerdict,
): Promise<CardsWritten> {
  const text = await readFile(`${runDir}/verdicts.jsonl`, "utf8").catch(() => "");
  const checked = verifyChain(text);
  if (!checked.ok) return { ok: false, error: `verdict log broken at line ${checked.error.line}: ${checked.error.reason}` };
  const files: string[] = [];
  let spentUsd = 0;
  for (const entry of checked.value) {
    if (entry.followUp !== "teach-card" || entry.verdict.kind === "allow") continue;
    const facts = collectFacts(entry.verdict, entry.commit, ledger);
    const explanation = await explain(facts);
    spentUsd += explanation.spentUsd;
    const payee = ledger.find((candidate) => candidate.name === facts.payeeName);
    await mkdir(`${runDir}/teach`, { recursive: true });
    const file = `${runDir}/teach/card-${entry.seq}.html`;
    await writeFile(file, renderCard({ entry, facts, explanation, payee }));
    console.log(`[teach] wrote ${file} rule=${facts.rule} by=${explanation.by}`);
    files.push(file);
  }
  return { ok: true, value: { files, spentUsd } };
}
