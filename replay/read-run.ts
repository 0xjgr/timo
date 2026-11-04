import { access, readdir, readFile, stat } from "node:fs/promises";
import { describeAction } from "../agent/actions.ts";
import type { Action, Response } from "../agent/responses.ts";

export type ReplayVerdict = { seq: number; kind: string; rule?: string; reason?: string; hasLens: boolean; hasCard: boolean };

export type ReplayStep = { image: string; words: string[]; actions: string[]; verdicts: number[] };

export type ReplayRun = {
  scenario: string;
  condition: string;
  model: string;
  outcome: string;
  rulesCommit: string;
  spentUsd: number;
  turns: number;
  seconds: number;
  transfers: { iban: string; amount: string }[];
  steps: ReplayStep[];
  verdicts: ReplayVerdict[];
  hasGuardian: boolean;
};

type Summary = {
  scenario: string; condition: string; model: string; outcome: string; spentUsd: number; turns: number; ms: number;
  transfers: { iban: string; amount: string }[];
};
type Entry = { seq: number; at: string; rulesCommit?: string } & (
  | { verdict: { kind: string; rule?: string; reason?: string } }
  | { decision: { isApproved: boolean; by: string; forSeq: number } }
);

// note: these files are written by our own harness in agent/run.ts, so they are read as typed, not parsed
export async function readRun(dir: string): Promise<ReplayRun> {
  const summary = JSON.parse(await readFile(`${dir}/summary.json`, "utf8")) as Summary;
  const responses = JSON.parse(await readFile(`${dir}/responses.json`, "utf8")) as Response[];
  const entries = (await readFile(`${dir}/verdicts.jsonl`, "utf8").catch(() => ""))
    .split("\n").filter(Boolean).map((line) => JSON.parse(line) as Entry);
  const images = (await readdir(dir)).filter((name) => /^step-\d+\.png$/.test(name)).sort();

  const steps: ReplayStep[] = images.map((image, index) => {
    const response = index === 0 ? undefined : responses[index - 1];
    return { image, words: readWords(response), actions: readActions(response), verdicts: [] };
  });
  const last = responses.at(-1);
  if (last && responses.length >= images.length) steps.at(-1)?.words.push(...readWords(last));

  // note: a verdict lands while a turn's actions run, so it shows on the next screenshot. the
  // response timestamps come from meta's clock, which runs ahead of ours; file times share the gate's clock
  const shotAt = await Promise.all(images.map(async (image) => (await stat(`${dir}/${image}`)).mtimeMs));
  for (const entry of entries) {
    const at = Date.parse(entry.at);
    const next = shotAt.findIndex((ms) => ms >= at);
    steps[next === -1 ? steps.length - 1 : next]?.verdicts.push(entry.seq);
  }

  const verdicts = await Promise.all(entries.map(async (entry) => ({
    seq: entry.seq,
    ...("verdict" in entry ? entry.verdict : readDecision(entry.decision)),
    hasLens: await isFile(`${dir}/lens/verdict-${entry.seq}.html`),
    hasCard: await isFile(`${dir}/teach/card-${entry.seq}.html`),
  })));

  return {
    scenario: summary.scenario,
    condition: summary.condition,
    model: summary.model,
    outcome: summary.outcome,
    rulesCommit: entries.find((entry) => entry.rulesCommit)?.rulesCommit ?? "",
    spentUsd: summary.spentUsd,
    turns: summary.turns,
    seconds: Math.round(summary.ms / 1000),
    transfers: summary.transfers.map(({ iban, amount }) => ({ iban, amount })),
    steps,
    verdicts,
    hasGuardian: await isFile(`${dir}/guardian.html`),
  };
}

// note: the guardian's answer is chained in the same log; "stand-in" is the scripted guardian of a recorded run
function readDecision(decision: { isApproved: boolean; by: string; forSeq: number }) {
  return {
    kind: decision.isApproved ? "approved" : "declined",
    rule: decision.by === "guardian" ? "by the family" : `by ${decision.by}`,
    reason: `answer to #${decision.forSeq}`,
  };
}

function readWords(response: Response | undefined): string[] {
  if (!response) return [];
  return response.output.flatMap((item) => item.type === "message" && "content" in item
    ? item.content.flatMap((part) => part.text ? [part.text] : [])
    : []);
}

function readActions(response: Response | undefined): string[] {
  if (!response) return [];
  return response.output.flatMap((item) => item.type === "computer_call" && "actions" in item
    ? (item.actions as Action[]).filter((action) => action.type !== "screenshot").map(describeAction)
    : []);
}

async function isFile(path: string): Promise<boolean> {
  return access(path).then(() => true, () => false);
}
