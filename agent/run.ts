import { parseArgs } from "node:util";
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
const result = await runErrand({
  condition,
  scenario,
  model,
  effort: args.effort,
  maxSteps: Number(args.steps),
  budgetUsd: Number(args.budget),
  runDir: `runs/${stamp}-${model}-${scenario}-${condition}`,
});
if (result.stopReason.startsWith("crash")) process.exitCode = 1;
