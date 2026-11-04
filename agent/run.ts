import { parseArgs } from "node:util";
import { writeDay } from "../guardian/write-day.ts";
import QRCode from "qrcode";
import { openPhone } from "../carmen/phone-app.ts";
import { tellOutcome } from "../carmen/tell-outcome.ts";
import type { Blocked } from "../gate/gates.ts";
import { openDesk } from "../guardian/live-desk.ts";
import { openLedgerBook } from "../ledger/ledger-book.ts";
import { writeCards } from "../teach/write-cards.ts";
import { isScenario } from "../world/scenario.ts";
import { transcribeRequest } from "../voice/transcribe.ts";
import { answerAsGuardian, CONDITIONS, isGuarded, runErrand, type Condition } from "./errand.ts";
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
    phone: { type: "boolean", default: false },
    show: { type: "boolean", default: false },
    "phone-port": { type: "string", default: "4400" },
    words: { type: "string" },
  },
});

const scenario = args.scenario;
const condition = args.condition as Condition;
if (!isScenario(scenario) || scenario === "crafted") throw new Error(`unknown scenario ${scenario}, crafted runs only from attacker/run-rounds.ts`);
if (!CONDITIONS.includes(condition)) throw new Error(`unknown condition ${condition}`);

const model = args.model as ModelId;
const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
const runDir = `runs/${stamp}-${model}-${scenario}-${condition}`;
if (!["stand-in", "live"].includes(args.guardian)) throw new Error(`unknown guardian ${args.guardian}, use stand-in or live`);
const book = await openLedgerBook(args.ledger);
const desk = args.guardian === "live" ? await openDesk({ runDir, book, host: args["desk-host"], port: Number(args["desk-port"]) }) : undefined;
if (desk) {
  console.log(`[desk] guardian link ${desk.url}`);
  console.log(`[desk] watch link ${desk.watchUrl}`);
  console.log(await QRCode.toString(desk.url, { type: "terminal", small: true }));
}
// note: carmen's phone only runs on localhost: browsers give the microphone to localhost or https only
const phone = args.phone ? await openPhone({ port: Number(args["phone-port"]), hear: transcribeRequest }) : undefined;
if (phone) {
  console.log(`[phone] carmen's link ${phone.url}`);
  console.log("[phone] waiting for carmen's request");
}
const words = phone ? await phone.waitForWords() : args.words;
if (words) console.log(`[run] request words="${words.slice(0, 160)}"`);
const askGuardian = phone
  ? async (block: Blocked) => {
      phone.showAsking();
      const answer = await (desk?.ask ?? (() => answerAsGuardian(scenario)))(block);
      console.log(`[phone] guardian answered seq=${block.seq}`);
      phone.showWorking();
      return answer;
    }
  : desk?.ask;
const result = await runErrand({
  condition,
  scenario,
  model,
  effort: args.effort,
  maxSteps: Number(args.steps),
  budgetUsd: Number(args.budget),
  runDir,
  askGuardian,
  ledger: book.payees,
  words,
  isShown: args.show,
});
if (result.stopReason.startsWith("crash")) process.exitCode = 1;
// note: cards are written after the errand, so the gate never waits on a model
let cardFile: string | undefined;
if (isGuarded(condition)) {
  const written = await writeCards(runDir, book.payees);
  if (!written.ok) console.log(`[teach] skipped reason="${written.error}"`);
  cardFile = written.ok ? written.value.files.at(-1) : undefined;
  await writeDay(runDir, book.payees, `Carmen's errand · ${scenario} · ${stamp}`);
}
if (phone) {
  const told = tellOutcome(result);
  phone.showDone(told.said, told.tone, cardFile);
  console.log(`[phone] told tone=${told.tone} voice_usd=${phone.readSpentUsd().toFixed(5)}`);
}
// note: the desk and the phone stay up after the errand so both see how it ended
if (desk || phone) {
  console.log("[run] errand done, the pages stay open; ctrl+c to close");
  process.on("SIGINT", () => Promise.all([desk?.close(), phone?.close()]).then(() => process.exit(0)));
}
