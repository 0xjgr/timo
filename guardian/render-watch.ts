import { readFileSync } from "node:fs";
import { FONT_FACES, MONO, SANS } from "../carmen/type-face.ts";

const FACE = `data:image/png;base64,${readFileSync(new URL("../carmen/timo.png", import.meta.url)).toString("base64")}`;

// note: the live feed beside the agent's browser on a wide screen; the browser covers the right side.
// the latest verdict is drawn large with where each value came from, older ones shrink to one line
const STYLE = `
${FONT_FACES}
:root { --bg: #0f1a22; --panel: #16242e; --line: #243642; --text: #e8efe9; --dim: #8ea39a;
  --deny: #ff6b57; --ask: #f5b335; --ok: #5fd08f; --deny-soft: #3a1d1a; --ask-soft: #362a14; --ok-soft: #173326; }
* { box-sizing: border-box; }
html, body { height: 100%; }
body { margin: 0; background: var(--bg); color: var(--text); font: 18px/1.4 ${SANS}; overflow: hidden; }
.mono { font-family: ${MONO}; }
aside { width: min(560px, 30vw); height: 100%; padding: 32px 26px; display: flex; flex-direction: column; gap: 22px; }
header { display: flex; gap: 14px; align-items: center; }
header img { width: 56px; height: 56px; border-radius: 30%; }
header b { font-size: 26px; font-weight: 800; display: block; line-height: 1.1; }
header span { color: var(--dim); font-size: 16px; }
ol { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; overflow: hidden; flex: 1; align-content: start; }
li { background: var(--panel); border-radius: 14px; padding: 12px 16px; animation: arrive .45s cubic-bezier(.2,.8,.2,1); }
@keyframes arrive { from { transform: translateY(-14px); opacity: 0; } }
li .top { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; }
li .kind { font-weight: 800; font-size: 19px; }
li.allow .kind { color: var(--ok); } li.deny .kind { color: var(--deny); } li.ask .kind { color: var(--ask); }
li .rule { font-size: 14px; color: var(--dim); }
li .line { color: var(--dim); font-size: 15px; margin-top: 2px; }
li.latest { padding: 20px 20px 18px; border: 2px solid var(--line); }
li.latest.allow { border-color: var(--ok); } li.latest.deny { border-color: var(--deny); } li.latest.ask { border-color: var(--ask); }
li.latest .kind { font-size: 34px; letter-spacing: -.01em; }
li.latest .rule { font-size: 16px; }
li.latest .scam { font-size: 19px; margin: 6px 0 14px; }
.trace { display: grid; grid-template-columns: auto 1fr; gap: 9px 14px; align-items: center; margin: 0; }
.trace dt { color: var(--dim); font-size: 15px; }
.trace dd { margin: 0; display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; }
.trace .value { font-size: 19px; font-weight: 700; }
.chip { font-size: 14px; font-weight: 700; padding: 3px 10px; border-radius: 99px; overflow-wrap: anywhere; }
.chip.carmen, .chip.ledger, .chip.payee { background: var(--ok-soft); color: var(--ok); }
.deny .chip.foreign { background: var(--deny-soft); color: var(--deny); }
.ask .chip.foreign { background: var(--ask-soft); color: var(--ask); }
.allow .chip.foreign { background: #22313b; color: var(--dim); }
.known { margin-top: 14px; font-size: 17px; }
.outcome { margin-top: 12px; font-size: 19px; font-weight: 800; }
.allow .outcome { color: var(--ok); } .deny .outcome { color: var(--deny); } .ask .outcome { color: var(--ask); }
.none { color: var(--dim); border: 1px dashed var(--line); background: transparent; }
footer { color: var(--dim); font-size: 13px; }
`;

export function renderWatch(nonce: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Timo live</title><style>${STYLE}</style></head><body><aside>
<header><img src="${FACE}" alt=""><div><b>Timo</b><span>Checks every payment Muse Spark 1.3 tries to make</span></div></header>
<ol id="feed"><li class="none">Waiting for the first payment.</li></ol>
<footer class="mono" id="chain">connecting</footer>
</aside><script nonce="${nonce}">${CLIENT}</script></body></html>`;
}

const CLIENT = `
const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => { const node = Object.assign(document.createElement(tag), props); node.append(...kids); return node; };
const WORD = { allow: "Allowed", deny: "Stopped", ask: "Held" };
const FIELD = { beneficiary: "Payee", iban: "Account", amount: "Amount" };
const VIA = { email: "email", page: "web page", pdf: "PDF", photo: "photo" };
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

const chip = (row) => el("span", { className: "chip " + row.from, textContent:
  row.from === "carmen" ? "Carmen said it" : row.from === "ledger" ? "Carmen's list" : (VIA[row.via] ?? "a source") + (row.domain ? " from " + row.domain : "") + (row.from === "payee" ? ", on her list" : "") });

function outcome(entry, waiting) {
  if (waiting) return "Asking the family. Nothing is paid yet.";
  if (entry.answer) return (entry.answer.isApproved ? "Approved" : "Declined") + " by " + (entry.answer.by === "guardian" ? "the family" : entry.answer.by) + ".";
  return entry.kind === "allow" ? "Every value traces to Carmen or her list. The payment goes out." : entry.kind === "deny" ? "No money moved." : "";
}

function drawLatest(entry, waiting) {
  const trace = el("dl", { className: "trace" });
  for (const row of entry.trace) trace.append(el("dt", { textContent: FIELD[row.kind] }), el("dd", {}, el("span", { className: "value" + (row.kind === "beneficiary" ? "" : " mono"), textContent: row.shown }), chip(row)));
  return el("li", { className: entry.kind + " latest" },
    el("div", { className: "top" }, el("span", { className: "kind", textContent: WORD[entry.kind] }), el("span", { className: "rule mono", textContent: entry.rule ?? "" })),
    entry.scam ? el("div", { className: "scam", textContent: entry.scam[0].toUpperCase() + entry.scam.slice(1) + "." }) : el("div", { className: "scam", textContent: ("Paying " + (entry.trace.find((row) => row.kind === "beneficiary")?.shown ?? entry.target) + ".").replace("..", ".") }),
    trace,
    entry.kind === "deny" && entry.knownAccountEnd ? el("div", { className: "known" }, "Carmen pays " + (entry.payeeName ?? "them") + " at ", el("b", { className: "mono", textContent: "···" + entry.knownAccountEnd })) : "",
    el("div", { className: "outcome", textContent: outcome(entry, waiting) }));
}

function drawOlder(entry, waiting) {
  const amount = entry.trace.find((row) => row.kind === "amount")?.shown;
  const payee = entry.trace.find((row) => row.kind === "beneficiary")?.shown ?? entry.target;
  return el("li", { className: entry.kind },
    el("div", { className: "top" }, el("span", { className: "kind", textContent: WORD[entry.kind] }), el("span", { className: "rule mono", textContent: entry.rule ?? "" })),
    el("div", { className: "line", textContent: ((amount ? amount + " to " : "") + payee + (outcome(entry, waiting) && entry.kind !== "allow" ? ". " + outcome(entry, waiting) : "")).replace("..", ".") }));
}

function draw(state) {
  $("chain").textContent = state.chain.ok ? "hash-chained log intact, head " + state.chain.head : "log broken at line " + state.chain.line;
  const waiting = new Set(state.pending.map((ask) => ask.seq));
  const key = JSON.stringify([state.log.map((entry) => [entry.seq, entry.answer && entry.answer.isApproved]), [...waiting]]);
  if (key === drawn || state.log.length === 0) return;
  drawn = key;
  const [latest, ...older] = state.log.slice().reverse().slice(0, 4);
  $("feed").replaceChildren(drawLatest(latest, waiting.has(latest.seq)), ...older.map((entry) => drawOlder(entry, waiting.has(entry.seq))));
}
start();
`;
