import { parseArgs } from "node:util";
import { HOUSEHOLD_LEDGER } from "../ledger/household.ts";
import { writeCards } from "../teach/write-cards.ts";
import { SCENARIOS, type Scenario } from "../world/scenario.ts";
import { CONDITIONS, runErrand, type Condition } from "./errand.ts";
import type { ModelId } from "./responses.ts";

const { values: args } = parseArgs({
  options: {
    model: { type: "string", default: "muse-spark-1.3-contributor" },
    scenario: { type: "string", default: "legit" },
    condition: { type: "string", default: "timo" },
    steps: { type: "string", default: "25" },
    budget: { type: "string", default: "0.25" },
    effort: { type: "string", default: "low" },
  },
});

const scenario = args.scenario as Scenario;
const condition = args.condition as Condition;
if (!SCENARIOS.includes(scenario)) throw new Error(`unknown scenario ${scenario}`);
if (!CONDITIONS.includes(condition)) throw new Error(`unknown condition ${condition}`);

const model = args.model as ModelId;
const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
const runDir = `runs/${stamp}-${model}-${scenario}-${condition}`;
const result = await runErrand({
  condition,
  scenario,
  model,
  effort: args.effort,
  maxSteps: Number(args.steps),
  budgetUsd: Number(args.budget),
  runDir,
});
if (result.stopReason.startsWith("crash")) process.exitCode = 1;
// note: cards are written after the errand, so the gate never waits on a model
if (condition === "timo") {
  const written = await writeCards(runDir, HOUSEHOLD_LEDGER);
  if (!written.ok) console.log(`[teach] skipped reason="${written.error}"`);
}
