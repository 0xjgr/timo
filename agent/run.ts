import { parseArgs } from "node:util";
import { writeDay } from "../guardian/write-day.ts";
import QRCode from "qrcode";
import { openDesk } from "../guardian/live-desk.ts";
import { openLedgerBook } from "../ledger/ledger-book.ts";
import { writeCards } from "../teach/write-cards.ts";
import { SCENARIOS, type Scenario } from "../world/scenario.ts";
import { CONDITIONS, isGuarded, runErrand, type Condition } from "./errand.ts";
import type { ModelId } from "./responses.ts";

const { values: args } = parseArgs({
  options: {
    model: { type: "string", default: "muse-spark-1.3-contributor" },
    scenario: { type: "string", default: "legit" },
    condition: { type: "string", default: "timo" },
    steps: { type: "string", default: "25" },
    budget: { type: "string", default: "0.25" },
    effort: { type: "string", default: "low" },
    guardian: { type: "string", default: "stand-in" },
    "desk-host": { type: "string", default: "127.0.0.1" },
    "desk-port": { type: "string", default: "4300" },
    ledger: { type: "string" },
  },
});

const scenario = args.scenario as Scenario;
const condition = args.condition as Condition;
if (!SCENARIOS.includes(scenario)) throw new Error(`unknown scenario ${scenario}`);
if (!CONDITIONS.includes(condition)) throw new Error(`unknown condition ${condition}`);

const model = args.model as ModelId;
const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
const runDir = `runs/${stamp}-${model}-${scenario}-${condition}`;
if (!["stand-in", "live"].includes(args.guardian)) throw new Error(`unknown guardian ${args.guardian}, use stand-in or live`);
const book = await openLedgerBook(args.ledger);
const desk = args.guardian === "live" ? await openDesk({ runDir, book, host: args["desk-host"], port: Number(args["desk-port"]) }) : undefined;
if (desk) {
  console.log(`[desk] guardian link ${desk.url}`);
  console.log(await QRCode.toString(desk.url, { type: "terminal", small: true }));
}
const result = await runErrand({
  condition,
  scenario,
  model,
  effort: args.effort,
  maxSteps: Number(args.steps),
  budgetUsd: Number(args.budget),
  runDir,
  askGuardian: desk?.ask,
  ledger: book.payees,
});
if (result.stopReason.startsWith("crash")) process.exitCode = 1;
// note: cards are written after the errand, so the gate never waits on a model
if (isGuarded(condition)) {
  const written = await writeCards(runDir, book.payees);
  if (!written.ok) console.log(`[teach] skipped reason="${written.error}"`);
  await writeDay(runDir, book.payees, `Carmen's errand · ${scenario} · ${stamp}`);
}
// note: the desk stays up after the errand so the guardian sees how it ended
if (desk) {
  console.log("[desk] errand done, the desk stays open; ctrl+c to close");
  process.on("SIGINT", () => desk.close().then(() => process.exit(0)));
}
