import type { ConditionScore } from "./score.ts";

export type Interval = { low: number; high: number };

const Z_95 = 1.959964;

// note: wilson stays inside [0, 1] and is honest at 0/88, where the normal approximation claims zero spread
export function wilsonInterval(hits: number, runs: number): Interval {
  if (runs === 0) return { low: 0, high: 1 };
  const rate = hits / runs;
  const z2 = Z_95 * Z_95;
  const center = (rate + z2 / (2 * runs)) / (1 + z2 / runs);
  const spread = (Z_95 / (1 + z2 / runs)) * Math.sqrt((rate * (1 - rate)) / runs + z2 / (4 * runs * runs));
  return { low: Math.max(0, center - spread), high: Math.min(1, center + spread) };
}

function logFactorial(n: number): number {
  let sum = 0;
  for (let k = 2; k <= n; k++) sum += Math.log(k);
  return sum;
}

// note: two-sided fisher exact test on a 2x2 table, summing every table with the same margins that is no more likely than the observed one
export function fisherExact(hitsA: number, runsA: number, hitsB: number, runsB: number): number {
  const hits = hitsA + hitsB;
  const total = runsA + runsB;
  const logTable = (a: number) =>
    logFactorial(hits) + logFactorial(total - hits) + logFactorial(runsA) + logFactorial(runsB)
    - logFactorial(total) - logFactorial(a) - logFactorial(hits - a) - logFactorial(runsA - a) - logFactorial(runsB - hits + a);
  const observed = logTable(hitsA);
  let pValue = 0;
  for (let a = Math.max(0, hits - runsB); a <= Math.min(hits, runsA); a++) {
    const logP = logTable(a);
    if (logP <= observed + 1e-9) pValue += Math.exp(logP);
  }
  return Math.min(1, pValue);
}

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function formatP(pValue: number): string {
  return pValue < 0.0001 ? pValue.toExponential(1) : pValue.toFixed(4);
}

// note: the attacker win rate is the claim the readme makes, so that is the one row with intervals and a test against every other condition
export function renderSignificance(scores: ConditionScore[], against = "timo"): string {
  const guard = scores.find((score) => score.condition === against);
  const lines = [
    `| Condition | Attacker won | 95% Wilson interval | Fisher p vs ${against} |`,
    "|---|---|---|---|",
    ...scores.map((score) => {
      const interval = wilsonInterval(score.attackSuccess, score.attackRuns);
      const rate = score.attackRuns === 0 ? 0 : score.attackSuccess / score.attackRuns;
      const pValue = !guard || score.condition === against ? "" : formatP(fisherExact(score.attackSuccess, score.attackRuns, guard.attackSuccess, guard.attackRuns));
      return `| ${score.condition} | ${score.attackSuccess}/${score.attackRuns} (${formatPercent(rate)}) | ${formatPercent(interval.low)} to ${formatPercent(interval.high)} | ${pValue} |`;
    }),
  ];
  const others = scores.filter((score) => score.condition !== against);
  const pairs = others.flatMap((first, index) => others.slice(index + 1).map((second) =>
    `${first.condition} vs ${second.condition}: Fisher p ${formatP(fisherExact(first.attackSuccess, first.attackRuns, second.attackSuccess, second.attackRuns))}`));
  return pairs.length === 0 ? lines.join("\n") : `${lines.join("\n")}\n\n${pairs.join("; ")}`;
}
