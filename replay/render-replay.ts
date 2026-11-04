import type { ReplayRun } from "./read-run.ts";

export type Story = { slug: string; title: string; threat: string; run: ReplayRun };

const STYLE = `
:root { --bg: #111312; --panel: #1a1d1b; --line: #2c312e; --text: #e6e8e3; --dim: #8d948f;
  --deny: #ff5a4e; --ask: #f2b705; --ok: #4cc38a; }
@media (prefers-color-scheme: light) { :root { --bg: #f4f4f1; --panel: #ffffff; --line: #d9dbd5; --text: #1b1d1c; --dim: #5f6661;
  --deny: #c62f24; --ask: #9a6b00; --ok: #1f7a4a; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.5 "DejaVu Sans", system-ui, sans-serif; }
main { max-width: 1080px; margin: 0 auto; padding: 24px 16px 48px; }
code, .mono, td, .facts { font-family: "DejaVu Sans Mono", ui-monospace, monospace; }
h1 { font-size: 22px; margin: 0 0 6px; } p { margin: 0 0 10px; }
h2 { font-size: 13px; color: var(--dim); text-transform: uppercase; letter-spacing: .08em; margin: 28px 0 10px; }
a { color: inherit; } .dim { color: var(--dim); }
.head { display: flex; gap: 16px; align-items: center; margin-bottom: 18px; }
.head img { width: 72px; height: 72px; border-radius: 22%; }
.facts { font-size: 13px; color: var(--dim); display: flex; flex-wrap: wrap; gap: 6px 18px; margin: 8px 0 0; }
.allow, .approved, .paid-payee, .replied { color: var(--ok); } .ask { color: var(--ask); }
.deny, .declined, .paid-attacker, .wrong-amount, .paid-other { color: var(--deny); }
table { border-collapse: collapse; width: 100%; font-size: 13px; }
td, th { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { color: var(--dim); font-weight: normal; font-family: inherit; }
.scroll { overflow-x: auto; }
.viewer { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 16px; }
@media (max-width: 820px) { .viewer { grid-template-columns: 1fr; } }
.screen { width: 100%; border: 1px solid var(--line); background: var(--panel); display: block; }
.side { border: 1px solid var(--line); background: var(--panel); padding: 12px 14px; font-size: 14px; }
.controls { display: flex; gap: 8px; align-items: center; margin: 10px 0; }
.controls button { font: inherit; padding: 6px 14px; border: 1px solid var(--line); background: var(--panel); color: var(--text); cursor: pointer; }
.controls input { flex: 1; accent-color: var(--ok); }
.said { margin: 0 0 10px; } .act { font-family: "DejaVu Sans Mono", monospace; font-size: 12px; color: var(--dim); overflow-wrap: anywhere; }
.flag { border-left: 3px solid currentColor; padding: 6px 10px; margin: 10px 0 0; font-weight: bold; }
.flag span { display: block; font-weight: normal; color: var(--text); font-size: 13px; }
.note { color: var(--dim); font-size: 13px; }
`;

function escape(text: string): string {
  return text.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[char]!);
}

// threat: the agent's words quote attacker mail; a "</script>" in them must not end the script block
function toScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028|\u2029/g, (char) => `\\u${char.charCodeAt(0).toString(16)}`);
}

function renderPage(title: string, body: string, script = ""): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title><link rel="icon" href="timo.png"><style>${STYLE}</style></head><body><main>${body}</main>${script}</body></html>`;
}

const OUTCOMES: Record<string, string> = {
  "paid-payee": "paid the real bill", "paid-attacker": "paid the scammer", "wrong-amount": "paid a wrong amount",
  "paid-other": "paid someone else", "replied": "replied", "no-payment": "paid nothing",
};

function describeOutcome(outcome: string): string {
  return escape(OUTCOMES[outcome] ?? outcome);
}

function describeCondition(condition: string): string {
  return condition === "bare" ? "without Timo" : condition === "timo" ? "with Timo" : condition;
}

export function renderIndex(stories: Story[], intro: string): string {
  const rows = stories.map(({ slug, title, threat, run }) => `<tr>
<td><a href="${slug}/">${escape(title)}</a><div class="dim">${escape(threat)}</div></td>
<td>${describeCondition(run.condition)}</td>
<td class="${run.outcome}">${describeOutcome(run.outcome)}</td>
<td>${run.verdicts.filter((verdict) => verdict.kind !== "allow").map((verdict) => `<span class="${escape(verdict.kind)}">${escape(verdict.kind)} ${escape(verdict.rule ?? "")}</span>`).join("<br>") || "-"}</td>
</tr>`).join("");
  return renderPage("Timo replays", `<div class="head"><img src="timo.png" alt=""><div><h1>Timo, replayed</h1>
<p class="dim">Real errands recorded from the repo's harness. Nothing on this site calls a model or needs a key.</p></div></div>
${intro}
<h2>Errands</h2><div class="scroll"><table><tr><th>Errand</th><th>Run</th><th>Outcome</th><th>What fired</th></tr>${rows}</table></div>`);
}

export function renderStory({ title, threat, run }: Story): string {
  const verdictRows = run.verdicts.map((verdict) => `<tr>
<td>${verdict.seq}</td><td class="${escape(verdict.kind)}">${escape(verdict.kind)}</td><td>${escape(verdict.rule ?? "")}</td>
<td style="font-family:inherit">${escape(verdict.reason ?? "")}</td>
<td>${[verdict.hasLens ? `<a href="lens/verdict-${verdict.seq}.html">lens</a>` : "", verdict.hasCard ? `<a href="teach/card-${verdict.seq}.html">carmen's card</a>` : ""].filter(Boolean).join(" ")}</td>
</tr>`).join("");
  const sent = run.transfers.map(({ iban, amount }) => `${amount} EUR to ${iban}`).join(", ") || "nothing";
  const body = `<p><a href="../">all errands</a></p>
<h1>${escape(title)} <span class="dim">${describeCondition(run.condition)}</span></h1>
<p>${escape(threat)}</p>
<div class="facts"><span>outcome <b class="${run.outcome}">${describeOutcome(run.outcome)}</b></span><span>sent ${escape(sent)}</span>
<span>${run.turns} turns</span><span>${run.seconds} s</span><span>$${run.spentUsd.toFixed(4)}</span><span>${escape(run.model)}</span>
${run.rulesCommit ? `<span>rules ${run.rulesCommit}</span>` : ""}</div>
<h2>What the agent saw and did</h2>
<div class="viewer"><div><img class="screen" id="screen" alt="screenshot of the agent's screen">
<div class="controls"><button id="prev">prev</button><input type="range" id="step" min="0" max="${run.steps.length - 1}" value="0" aria-label="step"><button id="next">next</button></div></div>
<div class="side" id="side"></div></div>
<h2>Verdict log</h2>
${run.verdicts.length ? `<div class="scroll"><table><tr><th>#</th><th>Verdict</th><th>Rule</th><th>Why</th><th></th></tr>${verdictRows}</table></div>` : `<p class="note">No verdicts: this run had no firewall, so every click went through.</p>`}
${run.hasGuardian ? `<p><a href="guardian.html">The guardian's page for this errand</a>, the hash-chained log the family sees.</p>` : ""}`;
  const verdicts = Object.fromEntries(run.verdicts.map((verdict) => [verdict.seq, verdict]));
  const script = `<script>
const STEPS = ${toScript(run.steps)}, VERDICTS = ${toScript(verdicts)};
const esc = (text) => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const slider = document.getElementById("step");
function show(index) {
  const step = STEPS[index]; slider.value = index;
  document.getElementById("screen").src = step.image;
  const flags = step.verdicts.map((seq) => VERDICTS[seq]).map((v) => '<div class="flag ' + esc(v.kind) + '">' + esc(v.kind) + ' ' + esc(v.rule || '') + (v.reason ? '<span>' + esc(v.reason) + '</span>' : '') + '</div>').join("");
  document.getElementById("side").innerHTML = '<div class="dim">step ' + index + ' of ' + (STEPS.length - 1) + '</div>' +
    step.words.map((w) => '<p class="said">' + esc(w) + '</p>').join("") +
    step.actions.map((a) => '<div class="act">' + esc(a) + '</div>').join("") + flags;
}
slider.addEventListener("input", () => show(Number(slider.value)));
document.getElementById("prev").addEventListener("click", () => show(Math.max(0, Number(slider.value) - 1)));
document.getElementById("next").addEventListener("click", () => show(Math.min(STEPS.length - 1, Number(slider.value) + 1)));
document.addEventListener("keydown", (e) => { if (e.key === "ArrowLeft") document.getElementById("prev").click(); if (e.key === "ArrowRight") document.getElementById("next").click(); });
show(0);
</script>`;
  return renderPage(`Timo replay: ${title}`, body, script);
}
