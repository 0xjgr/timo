import { readFile } from "node:fs/promises";
import { verifyChain } from "./verdict-log.ts";

const path = process.argv[2];
if (!path) {
  console.error("usage: npm run verify -- runs/<run>/verdicts.jsonl");
  process.exit(2);
}

const checked = verifyChain(await readFile(path, "utf8"));
if (checked.ok) {
  const denies = checked.value.filter((entry) => entry.verdict.kind === "deny").length;
  console.log(`[verify] ok entries=${checked.value.length} deny=${denies} head=${checked.value.at(-1)?.hash.slice(0, 12) ?? "empty"}`);
} else {
  console.log(`[verify] broken line=${checked.error.line} reason="${checked.error.reason}"`);
  process.exit(1);
}
