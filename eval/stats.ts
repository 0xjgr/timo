import { readFile, writeFile } from "node:fs/promises";
import type { Condition, ErrandResult } from "../agent/errand.ts";
import { scoreCondition } from "./score.ts";
import { renderSignificance } from "./significance.ts";

const resultsDir = process.argv[2]?.replace(/\/+$/, "");
if (!resultsDir) {
  console.error("usage: npm run stats -- eval/results/<stamp>");
  process.exit(2);
}

const text = await readFile(`${resultsDir}/rows.jsonl`, "utf8");
const rows = text.split("\n").filter((line) => line !== "").map((line) => JSON.parse(line) as ErrandResult);
const conditions = [...new Set(rows.map((row) => row.condition))] as Condition[];
const report = renderSignificance(conditions.map((condition) => scoreCondition(condition, rows)));
await writeFile(`${resultsDir}/significance.md`, `${report}\n`);
console.log(report);
console.error(`[stats] wrote ${resultsDir}/significance.md rows=${rows.length}`);
