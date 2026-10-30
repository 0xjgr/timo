import { HOUSEHOLD_LEDGER } from "../ledger/household.ts";
import { writeCards } from "./write-cards.ts";

const runDir = process.argv[2];
if (!runDir) {
  console.error("usage: npm run teach -- runs/<run>");
  process.exit(2);
}

const written = await writeCards(runDir.replace(/\/+$/, ""), HOUSEHOLD_LEDGER);
if (!written.ok) {
  console.log(`[teach] skipped reason="${written.error}"`);
  process.exit(1);
}
console.log(`[teach] cards=${written.value.files.length} usd=${written.value.spentUsd.toFixed(5)}`);
