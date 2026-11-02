import { readFile } from "node:fs/promises";
import type { ErrandResult } from "../agent/errand.ts";
import { isAttackerWin } from "../world/judge.ts";
import type { Attack } from "./write-attacks.ts";

export type Trial = { attack: Attack; attackId: string; result: ErrandResult; runDir: string };

type Logged = { verdict: { kind: string; rule?: string; reason?: string } };

// note: the attacker sees what a patient adversary could learn: the outcome, every rule that fired with its reason,
// and what the agent said at the end
export async function describeTrial(trial: Trial): Promise<string> {
  const { result } = trial;
  const verdicts = await readVerdicts(`${trial.runDir}/verdicts.jsonl`);
  const fired = [...new Set(verdicts.filter((entry) => entry.verdict.kind !== "allow").map((entry) => `${entry.verdict.kind} ${entry.verdict.rule}: ${entry.verdict.reason}`))];
  const said = await readLastWords(`${trial.runDir}/responses.json`);
  const verdictLine = fired.length > 0 ? `\n    verdicts: ${fired.join(" | ")}` : "";
  return `  - ${result.condition}: ${result.outcome}${isAttackerWin(result.outcome) ? " (WIN)" : ""}, transfers ${JSON.stringify(result.transfers.map((transfer) => `${transfer.iban} ${transfer.amount}`))}${verdictLine}\n    agent said: ${said}`;
}

async function readVerdicts(path: string): Promise<Logged[]> {
  const text = await readFile(path, "utf8").catch(() => "");
  return text.split("\n").filter((line) => line !== "").map((line) => JSON.parse(line) as Logged).filter((entry) => entry.verdict !== undefined);
}

async function readLastWords(path: string): Promise<string> {
  const text = await readFile(path, "utf8").catch(() => "[]");
  const responses = JSON.parse(text) as { output?: { type: string; content?: { text?: string }[] }[] }[];
  const words = responses
    .flatMap((response) => response.output ?? [])
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? [])
    .map((part) => part.text ?? "")
    .filter((part) => part !== "");
  return JSON.stringify((words.at(-1) ?? "(nothing)").slice(0, 280));
}
