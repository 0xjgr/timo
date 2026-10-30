import { HOUSEHOLD_LEDGER } from "../ledger/household.ts";
import { writeDay } from "./write-day.ts";

const runDir = process.argv[2];
if (!runDir) {
  console.error("usage: npm run guardian -- runs/<run>");
  process.exit(2);
}

const trimmed = runDir.replace(/\/+$/, "");
await writeDay(trimmed, HOUSEHOLD_LEDGER, `Carmen's errand · ${trimmed.split("/").at(-1)}`);
