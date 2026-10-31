import assert from "node:assert/strict";
import { test } from "node:test";
import type { ConditionScore } from "./score.ts";
import { fisherExact, renderSignificance, wilsonInterval } from "./significance.ts";

function close(actual: number, expected: number, tolerance = 1e-4) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} is not ${expected}`);
}

test("wilson: zero hits still leaves room above zero", () => {
  const interval = wilsonInterval(0, 88);
  close(interval.low, 0);
  close(interval.high, 3.841459 / (88 + 3.841459));
});

test("wilson: matches the textbook 24/89", () => {
  const interval = wilsonInterval(24, 89);
  close(interval.low, 0.1882, 1e-3);
  close(interval.high, 0.3700, 1e-3);
});

test("fisher: lady tasting tea, two-sided", () => {
  close(fisherExact(3, 4, 1, 4), 0.4857);
});

test("fisher: identical groups give p = 1", () => {
  close(fisherExact(5, 10, 5, 10), 1);
});

test("significance table: no p value against itself", () => {
  const score = (condition: string, attackSuccess: number) => ({ condition, attackSuccess, attackRuns: 89 }) as ConditionScore;
  const table = renderSignificance([score("bare", 24), score("timo", 0)]);
  assert.match(table, /\| bare \| 24\/89 \(27\.0%\) \| 18\.\d% to 37\.\d% \| \d\.\de-\d \|/);
  assert.match(table, /\| timo \| 0\/89 \(0\.0%\) \| 0\.0% to 4\.\d% \|  \|/);
});
