import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { CONDITIONS, runErrand, type Condition, type ErrandResult } from "../agent/errand.ts";
import type { ModelId } from "../agent/responses.ts";
import { readRulesCommit } from "../gate/rules-commit.ts";
import { SCENARIOS, type Scenario } from "../world/scenario.ts";
import { isHarnessFailure, renderScenarioTable, renderTable, scoreCondition } from "./score.ts";

const { values: args } = parseArgs({
  options: {
    model: { type: "string", default: "muse-spark-1.3-contributor" },
    repeats: { type: "string", default: "1" },
    concurrency: { type: "string", default: "4" },
    conditions: { type: "string", default: CONDITIONS.join(",") },
    scenarios: { type: "string", default: SCENARIOS.join(",") },
    "run-budget": { type: "string", default: "0.05" },
    "total-budget": { type: "string", default: "0.50" },
    steps: { type: "string", default: "25" },
    // note: an earlier results dir; good rows are kept, missing and crashed jobs run again
    resume: { type: "string" },
  },
});

const model = args.model as ModelId;
const conditions = args.conditions.split(",") as Condition[];
const scenarios = args.scenarios.split(",") as Scenario[];
if (!conditions.every((condition) => CONDITIONS.includes(condition))) throw new Error(`unknown condition in ${args.conditions}`);
if (!scenarios.every((scenario) => SCENARIOS.includes(scenario))) throw new Error(`unknown scenario in ${args.scenarios}`);
const runBudget = Number(args["run-budget"]);
const totalBudget = Number(args["total-budget"]);

const stamp = args.resume ? args.resume.replace(/\/+$/, "").split("/").at(-1)! : new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
const outDir = `eval/results/${stamp}`;
await mkdir(outDir, { recursive: true });
const kept = args.resume ? await readRows(`${outDir}/rows.jsonl`) : [];
const done = new Set(kept.filter((row) => !isHarnessFailure(row)).map((row) => row.runId));

// note: repeats outermost, so a batch cut by the budget stays balanced across cells
const jobs = Array.from({ length: Number(args.repeats) }, (_, repeat) =>
  conditions.flatMap((condition) => scenarios.map((scenario) => ({ condition, scenario, repeat }))),
)
  .flat()
  .filter((job) => !done.has(`${job.condition}-${job.scenario}-${job.repeat}`));

const rulesCommit = readRulesCommit();
console.error(`[eval] jobs=${jobs.length} kept=${done.size} model=${model} rules=${rulesCommit} worst-case usd=${(jobs.length * runBudget).toFixed(2)} cap=${totalBudget}`);

const rows: ErrandResult[] = kept;
let spent = 0;
let running = 0;
let finished = 0;
let next = 0;

// threat: a batch that keeps going after the credits it was allowed. each running errand
// reserves its full per-run cap, so the worst case never crosses the total
const canStart = () => spent + (running + 1) * runBudget <= totalBudget;
const waiting: (() => void)[] = [];

async function work(): Promise<void> {
  while (next < jobs.length) {
    if (!canStart()) {
      // note: out of reserve with nothing running means the cap is reached for good
      if (running === 0) return;
      await new Promise<void>((resolve) => waiting.push(resolve));
      continue;
    }
    const job = jobs[next++]!;
    running++;
    const result = await runErrand({
      ...job,
      model,
      effort: "low",
      maxSteps: Number(args.steps),
      budgetUsd: runBudget,
      runDir: `runs/eval-${stamp}/${job.condition}-${job.scenario}-${job.repeat}`,
    });
    running--;
    spent += result.spentUsd;
    rows.push(result);
    finished++;
    await appendFile(`${outDir}/rows.jsonl`, `${JSON.stringify(result)}\n`);
    console.error(`[eval] ${finished}/${jobs.length} ${job.condition} ${job.scenario} -> ${result.outcome} usd=${spent.toFixed(4)}`);
    for (const wake of waiting.splice(0)) wake();
  }
}

await Promise.all(Array.from({ length: Number(args.concurrency) }, work));
if (finished < jobs.length) console.error(`[eval] stopped at the budget cap after ${finished} jobs`);

const table = `${renderTable(conditions.map((condition) => scoreCondition(condition, rows)))}\n\n${renderScenarioTable(conditions, rows)}`;
const scored = rows.filter((row) => !isHarnessFailure(row));
const totalUsd = rows.reduce((sum, row) => sum + row.spentUsd, 0);
const header = `model ${model}, rules ${rulesCommit}, scenarios ${scenarios.join("/")}, ${scored.length} scored errands (${rows.length - scored.length} harness failures kept in rows.jsonl, not scored), $${totalUsd.toFixed(4)}`;
await writeFile(`${outDir}/table.md`, `${header}\n\n${table}\n`);
console.error(`\n${header}\n\n${table}`);

async function readRows(path: string): Promise<ErrandResult[]> {
  const text = await readFile(path, "utf8");
  return text.split("\n").filter((line) => line !== "").map((line) => JSON.parse(line) as ErrandResult);
}
