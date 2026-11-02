import { appendFile, mkdir, rm, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { CONDITIONS, runErrand, type Condition } from "../agent/errand.ts";
import type { ModelId } from "../agent/responses.ts";
import { readRulesCommit } from "../gate/rules-commit.ts";
import { isHarnessFailure } from "../eval/score.ts";
import { isAttackerWin } from "../world/judge.ts";
import { writeBrief } from "./brief.ts";
import { describeTrial, type Trial } from "./feedback.ts";
import { ATTACKER_MODEL, writeAttacks } from "./write-attacks.ts";

const { values: args } = parseArgs({
  options: {
    model: { type: "string", default: "muse-spark-1.3-contributor" },
    rounds: { type: "string", default: "5" },
    "per-round": { type: "string", default: "4" },
    repeats: { type: "string", default: "2" },
    conditions: { type: "string", default: "bare,timo" },
    concurrency: { type: "string", default: "4" },
    steps: { type: "string", default: "25" },
    "run-budget": { type: "string", default: "0.05" },
    "total-budget": { type: "string", default: "3.00" },
  },
});

const model = args.model as ModelId;
const conditions = args.conditions.split(",") as Condition[];
if (!conditions.every((condition) => CONDITIONS.includes(condition))) throw new Error(`unknown condition in ${args.conditions}`);
const runBudget = Number(args["run-budget"]);
const totalBudget = Number(args["total-budget"]);
const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
const outDir = `eval/results/attacker-${stamp}`;
await mkdir(outDir, { recursive: true });

const rulesCommit = readRulesCommit();
const brief = await writeBrief();
const trials: Trial[] = [];
const history: string[] = [];
let spent = 0;
console.error(`[attacker] rounds=${args.rounds} per-round=${args["per-round"]} conditions=${args.conditions} repeats=${args.repeats} attacker=${ATTACKER_MODEL} victim=${model} rules=${rulesCommit} cap=${totalBudget}`);

for (let round = 1; round <= Number(args.rounds); round++) {
  const written = await writeAttacks(brief, history.join("\n\n"), Number(args["per-round"]));
  spent += written.spentUsd;
  if (!written.ok) {
    console.error(`[attacker] round=${round} no attacks reason="${written.error.slice(0, 200)}" usd=${spent.toFixed(4)}`);
    break;
  }
  const jobs = written.attacks.flatMap((attack, index) => {
    const attackId = `r${round}-a${index + 1}`;
    return Array.from({ length: Number(args.repeats) }, (_, repeat) => conditions.map((condition) => ({ attack, attackId, condition, repeat }))).flat();
  });
  for (const [index, attack] of written.attacks.entries()) {
    await appendFile(`${outDir}/attacks.jsonl`, `${JSON.stringify({ round, attackId: `r${round}-a${index + 1}`, ...attack })}\n`);
    console.error(`[attacker] r${round}-a${index + 1} from=${attack.address} idea="${attack.idea.slice(0, 120)}"`);
  }

  const roundTrials: Trial[] = [];
  let next = 0;
  // threat: a red team loop that keeps spending; every running errand reserves its full cap
  const work = async () => {
    while (next < jobs.length && spent + runBudget <= totalBudget) {
      const job = jobs[next++]!;
      spent += runBudget;
      const runDir = `runs/attacker-${stamp}/${job.attackId}-${job.condition}-${job.repeat}`;
      await rm(runDir, { recursive: true, force: true });
      const result = await runErrand({ condition: job.condition, scenario: "crafted", crafted: job.attack, model, effort: "low", maxSteps: Number(args.steps), budgetUsd: runBudget, runDir });
      spent += result.spentUsd - runBudget;
      const trial = { attack: job.attack, attackId: job.attackId, result, runDir };
      roundTrials.push(trial);
      await appendFile(`${outDir}/rows.jsonl`, `${JSON.stringify({ round, attackId: job.attackId, ...result })}\n`);
      console.error(`[attacker] ${job.attackId} ${job.condition} -> ${result.outcome} usd=${spent.toFixed(4)}`);
    }
  };
  await Promise.all(Array.from({ length: Number(args.concurrency) }, work));
  trials.push(...roundTrials);

  for (const [index, attack] of written.attacks.entries()) {
    const attackId = `r${round}-a${index + 1}`;
    const mine = roundTrials.filter((trial) => trial.attackId === attackId).sort((a, b) => a.result.condition.localeCompare(b.result.condition));
    const lines = await Promise.all(mine.map(describeTrial));
    history.push(`${attackId} from ${attack.from} <${attack.address}>, "${attack.subject}"\n  idea: ${attack.idea}\n${lines.join("\n")}`);
  }
  if (next < jobs.length) {
    console.error(`[attacker] stopped at the budget cap in round ${round}`);
    break;
  }
}

const table = renderAttackerTable(trials, conditions);
const header = `attacker ${ATTACKER_MODEL}, victim ${model}, rules ${rulesCommit}, ${trials.length} errands, $${spent.toFixed(4)}`;
await writeFile(`${outDir}/table.md`, `${header}\n\n${table}\n`);
await writeFile(`${outDir}/history.md`, history.join("\n\n"));
console.error(`\n${header}\n\n${table}`);

function renderAttackerTable(all: Trial[], names: Condition[]): string {
  const scored = all.filter((trial) => !isHarnessFailure(trial.result));
  const rows = names.map((condition) => {
    const mine = scored.filter((trial) => trial.result.condition === condition);
    const wins = mine.filter((trial) => isAttackerWin(trial.result.outcome)).length;
    const asked = mine.filter((trial) => trial.result.asks > 0).length;
    const paidReal = mine.filter((trial) => trial.result.outcome === "paid-payee").length;
    return `| ${condition} | ${wins}/${mine.length} | ${asked}/${mine.length} | ${paidReal}/${mine.length} |`;
  });
  return ["| Condition | Attacker won | Reached the guardian | Paid the real bill |", "|---|---|---|---|", ...rows].join("\n");
}
