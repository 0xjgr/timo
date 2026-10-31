const STYLE = `
:root { --bg: #111312; --panel: #1a1d1b; --line: #2c312e; --text: #e6e8e3; --dim: #8d948f;
  --deny: #ff5a4e; --ask: #f2b705; --ok: #4cc38a; }
@media (prefers-color-scheme: light) { :root { --bg: #f4f4f1; --panel: #ffffff; --line: #d9dbd5; --text: #1b1d1c; --dim: #5f6661;
  --deny: #c62f24; --ask: #9a6b00; --ok: #1f7a4a; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.5 "DejaVu Sans", system-ui, sans-serif; }
main { max-width: 560px; margin: 0 auto; padding: 20px 16px 48px; }
.mono, code { font-family: "DejaVu Sans Mono", ui-monospace, monospace; }
h1 { font-size: 18px; margin: 0; } h2 { font-size: 12px; color: var(--dim); text-transform: uppercase; letter-spacing: .08em; margin: 28px 0 8px; }
.status { color: var(--dim); font-size: 13px; margin: 4px 0 0; }
.ask { border: 1px solid var(--ask); background: var(--panel); padding: 16px; margin-top: 16px; }
.ask .head { color: var(--ask); font-weight: bold; letter-spacing: .05em; font-size: 13px; }
.ask .who { font-size: 22px; margin: 8px 0 2px; overflow-wrap: anywhere; }
.ask .money { font-size: 18px; }
.ask dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; font-size: 14px; margin: 14px 0; }
.ask dt { color: var(--dim); } .ask dd { margin: 0; overflow-wrap: anywhere; }
.flag { border-left: 3px solid var(--deny); padding: 6px 10px; margin: 10px 0; font-size: 14px; }
.flag b { color: var(--deny); }
.check { display: flex; gap: 10px; align-items: flex-start; font-size: 14px; margin: 14px 0; }
.check input { width: 22px; height: 22px; margin: 0; flex: none; }
.buttons { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
button { font: inherit; font-weight: bold; padding: 14px; border: 1px solid var(--line); background: var(--bg); color: var(--text); cursor: pointer; }
button.approve { border-color: var(--ok); color: var(--ok); } button.decline { border-color: var(--deny); color: var(--deny); }
button:disabled { opacity: .35; cursor: not-allowed; }
.timer { color: var(--dim); font-size: 13px; margin-top: 10px; }
a { color: inherit; }
.empty { color: var(--dim); border: 1px dashed var(--line); padding: 16px; margin-top: 16px; }
ol { list-style: none; padding: 0; margin: 0; font-size: 13px; }
ol li.empty { display: block; margin: 0; }
ol li { display: grid; grid-template-columns: 2.2em 4.6em 1fr; gap: 8px; padding: 7px 0; border-bottom: 1px solid var(--line); }
.allow { color: var(--ok); } .deny { color: var(--deny); } .askk { color: var(--ask); }
.overlay { position: fixed; inset: 0; background: var(--bg); display: none; flex-direction: column; }
.overlay.open { display: flex; } .overlay iframe { flex: 1; border: 0; background: #fff; }
.overlay button { border-width: 0 0 1px; }
`;

// note: no data in the html; the script fetches it after the link's token becomes a cookie
export function renderDesk(nonce: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Timo guardian desk</title><style>${STYLE}</style></head><body><main>
<h1>Timo · guardian desk</h1>
<p class="status mono" id="status">connecting</p>
<div id="asks"></div>
<h2>Today</h2>
<ol id="log"></ol>
</main>
<div class="overlay" id="overlay"><button id="close-overlay">Close evidence</button><iframe id="evidence" title="What Timo saw"></iframe></div>
<script nonce="${nonce}">${CLIENT}</script></body></html>`;
}

const CLIENT = `
const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => { const node = Object.assign(document.createElement(tag), props); node.append(...kids); return node; };
const VIA = { email: "an email", page: "a web page", pdf: "a PDF", photo: "a letter" };
const SAYS = { "payment-change": "says the bank account changed", pressure: "pushes to pay now", elsewhere: "sends you to pay or log in elsewhere", "ai-instruction": "gives orders to the assistant", secrecy: "asks to keep it secret" };
let shown = "";
let lastAnswer = "";

async function start() {
  const token = new URLSearchParams(location.hash.slice(1)).get("t");
  if (token) {
    const res = await fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
    history.replaceState(null, "", "/");
    if (!res.ok) { $("status").textContent = "this link is not valid, open the one Timo printed"; return; }
  }
  poll();
}

async function poll() {
  try {
    const res = await fetch("/api/state");
    if (res.status === 401) { $("status").textContent = "open the link Timo printed"; return; }
    draw(await res.json());
  } catch { $("status").textContent = "Timo is not running"; }
  setTimeout(poll, 1500);
}

function draw(state) {
  $("status").textContent = state.chain.ok ? "log intact · head " + state.chain.head : "log broken at line " + state.chain.line + ", do not trust it";
  const key = state.pending.map((ask) => ask.seq).join(",");
  if (key !== shown) {
    shown = key;
    const idle = (lastAnswer ? lastAnswer + " " : "") + "Nothing waiting for you. Timo asks only when a payment does not trace to you or your ledger.";
    $("asks").replaceChildren(...(state.pending.length ? state.pending.map(drawAsk) : [el("div", { className: "empty", textContent: idle })]));
  }
  for (const timer of document.querySelectorAll("[data-expires]")) {
    const left = Math.max(0, Date.parse(timer.dataset.expires) - Date.now());
    timer.textContent = "Declines on its own in " + Math.floor(left / 60000) + ":" + String(Math.floor(left / 1000) % 60).padStart(2, "0");
  }
  if (state.log.length === 0) $("log").replaceChildren(el("li", { className: "empty", textContent: "No payments checked yet." }));
  else $("log").replaceChildren(...state.log.slice().reverse().map((entry) => el("li", {},
    el("span", { className: "mono", textContent: "#" + entry.seq }),
    el("span", { className: "mono " + (entry.kind === "ask" ? "askk" : entry.kind), textContent: entry.kind.toUpperCase() }),
    el("span", { textContent: (entry.rule ?? "paid as asked") + " · " + entry.target + (entry.answer ? " · " + (entry.answer.isApproved ? "approved" : "declined") + " by " + (entry.answer.by === "guardian" ? "you" : entry.answer.by) : "") }))));
}

function drawAsk(ask) {
  const who = ask.payeeName ?? ask.beneficiary ?? "an unknown payee";
  const facts = el("dl");
  const fact = (term, value) => { if (value) facts.append(el("dt", { textContent: term }), el("dd", { textContent: value })); };
  fact("To account", ask.formAccountEnd && "ending " + ask.formAccountEnd + (ask.knownAccountEnd ? ", your ledger has ending " + ask.knownAccountEnd : ", not in your ledger"));
  fact("Came from", ask.sourceVia && (VIA[ask.sourceVia] ?? ask.sourceVia) + (ask.sourceDomain ? " from " + ask.sourceDomain : ""));
  fact("Looks like", ask.scam);
  fact("Rule", ask.rule);
  const flags = ask.flags.map((flag) => el("div", { className: "flag" }, el("b", { textContent: "Second reader: " }), "this " + (SAYS[flag.reason] ?? flag.reason) + ": ", el("q", { textContent: flag.quote })));
  const approve = el("button", { className: "approve", textContent: "Approve once", disabled: true });
  const decline = el("button", { className: "decline", textContent: "Decline" });
  const checked = el("input", { type: "checkbox" });
  checked.addEventListener("change", () => { approve.disabled = !checked.checked; });
  const answer = async (isApproved) => {
    approve.disabled = decline.disabled = true;
    const res = await fetch("/api/answer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ seq: ask.seq, isApproved }) });
    lastAnswer = !res.ok ? "#" + ask.seq + " was no longer waiting." : isApproved ? "You approved #" + ask.seq + ", Timo sends that exact payment once." : "You declined #" + ask.seq + ", nothing was sent.";
  };
  approve.addEventListener("click", () => answer(true));
  decline.addEventListener("click", () => answer(false));
  const timer = el("div", { className: "timer mono" });
  timer.dataset.expires = ask.expiresAt;
  const evidence = ask.lensHref ? el("p", {}, el("a", { href: "#", textContent: "See what Timo saw", onclick: (event) => { event.preventDefault(); $("evidence").src = ask.lensHref; $("overlay").classList.add("open"); } })) : "";
  return el("section", { className: "ask" },
    el("div", { className: "head mono", textContent: "TIMO IS HOLDING A PAYMENT · #" + ask.seq }),
    el("div", { className: "who", textContent: who }),
    el("div", { className: "money mono", textContent: ask.amount ? ask.amount + " EUR" : "" }),
    facts, ...flags, evidence,
    el("label", { className: "check" }, checked, el("span", { textContent: "I checked with them on a phone number I already had, not one from this message." })),
    el("div", { className: "buttons" }, approve, decline),
    timer);
}

$("close-overlay").addEventListener("click", () => { $("overlay").classList.remove("open"); $("evidence").src = "about:blank"; });
start();
`;
