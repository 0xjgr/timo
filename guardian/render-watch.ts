import { readFileSync } from "node:fs";

const FACE = `data:image/png;base64,${readFileSync(new URL("../carmen/timo.png", import.meta.url)).toString("base64")}`;

// note: the live feed beside the agent's browser on a wide screen; the browser covers the right side
const STYLE = `
:root { --bg: #111312; --panel: #1a1d1b; --line: #2c312e; --text: #e6e8e3; --dim: #8d948f; --deny: #ff5a4e; --ask: #f2b705; --ok: #4cc38a; }
* { box-sizing: border-box; }
html, body { height: 100%; }
body { margin: 0; background: var(--bg); color: var(--text); font: 17px/1.45 "DejaVu Sans", system-ui, sans-serif; overflow: hidden; }
.mono { font-family: "DejaVu Sans Mono", ui-monospace, monospace; }
aside { width: min(560px, 30vw); height: 100%; padding: 34px 28px; display: flex; flex-direction: column; gap: 22px; }
header { display: flex; gap: 14px; align-items: center; }
header img { width: 60px; height: 60px; border-radius: 22%; }
header b { font-size: 22px; display: block; } header span { color: var(--dim); font-size: 14px; }
.lead { font-size: 21px; line-height: 1.35; margin: 0; }
.lead em { font-style: normal; color: var(--ok); }
.dim { color: var(--dim); font-size: 15px; margin: 0; }
h2 { font-size: 13px; color: var(--dim); text-transform: uppercase; letter-spacing: .1em; margin: 6px 0 -8px; }
ol { list-style: none; padding: 0; margin: 0; display: grid; gap: 12px; overflow: hidden; flex: 1; align-content: start; }
li { background: var(--panel); border: 1px solid var(--line); border-left: 6px solid var(--line); padding: 12px 14px; animation: arrive .4s ease-out; }
@keyframes arrive { from { transform: translateX(-24px); opacity: 0; } }
li.allow { border-left-color: var(--ok); } li.deny { border-left-color: var(--deny); } li.ask { border-left-color: var(--ask); }
li .top { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; }
li .kind { font-weight: bold; font-size: 22px; letter-spacing: .04em; }
li.allow .kind { color: var(--ok); } li.deny .kind { color: var(--deny); } li.ask .kind { color: var(--ask); }
li .rule { font-size: 17px; }
li .why { color: var(--dim); font-size: 14px; margin-top: 6px; overflow-wrap: anywhere; }
li .answer { margin-top: 6px; font-size: 15px; }
li.latest { box-shadow: 0 0 0 1px currentColor inset; }
.waiting { color: var(--ask); font-weight: bold; }
.none { color: var(--dim); border-style: dashed; border-left-width: 1px; }
footer { color: var(--dim); font-size: 13px; }
`;

export function renderWatch(nonce: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Timo live</title><style>${STYLE}</style></head><body><aside>
<header><img src="${FACE}" alt=""><div><b>Timo</b><span>provenance firewall · live</span></div></header>
<p class="lead">Muse Spark 1.3 is doing Carmen's errand on the right. <em>Every click that moves money stops here first.</em></p>
<p class="dim">Each IBAN, amount and name must trace to Carmen's words or her ledger. Eleven fixed rules; no model can overrule a deny.</p>
<h2>Verdicts</h2>
<ol id="feed"><li class="none">Waiting for the first payment.</li></ol>
<footer class="mono" id="chain">connecting</footer>
</aside><script nonce="${nonce}">${CLIENT}</script></body></html>`;
}

const CLIENT = `
const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => { const node = Object.assign(document.createElement(tag), props); node.append(...kids); return node; };
let drawn = "";

async function start() {
  const token = new URLSearchParams(location.hash.slice(1)).get("t");
  if (token) await fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
  history.replaceState(null, "", "/watch");
  poll();
}

async function poll() {
  try { const res = await fetch("/api/state"); if (res.ok) draw(await res.json()); } catch {}
  setTimeout(poll, 700);
}

function draw(state) {
  $("chain").textContent = state.chain.ok ? "hash-chained log intact · head " + state.chain.head : "log broken at line " + state.chain.line;
  const waiting = new Set(state.pending.map((ask) => ask.seq));
  const key = JSON.stringify([state.log.map((entry) => [entry.seq, entry.answer && entry.answer.isApproved]), [...waiting]]);
  if (key === drawn || state.log.length === 0) return;
  drawn = key;
  $("feed").replaceChildren(...state.log.slice().reverse().slice(0, 5).map((entry, index) => el("li", { className: entry.kind + (index === 0 ? " latest" : "") },
    el("div", { className: "top" }, el("span", { className: "kind mono", textContent: entry.kind.toUpperCase() }), el("span", { className: "rule mono", textContent: entry.rule ?? "traced to Carmen" })),
    el("div", { className: "why", textContent: entry.reason ?? "every value traces to her request or her ledger · " + entry.target }),
    waiting.has(entry.seq) ? el("div", { className: "answer waiting", textContent: "held · asking the family" })
    : entry.answer ? el("div", { className: "answer", textContent: (entry.answer.isApproved ? "approved" : "declined") + " by " + (entry.answer.by === "guardian" ? "the family" : entry.answer.by) }) : "")));
}
start();
`;
