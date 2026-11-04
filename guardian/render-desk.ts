import { readFileSync } from "node:fs";
import { FONT_FACES, MONO, SANS } from "../carmen/type-face.ts";

const FACE = `data:image/png;base64,${readFileSync(new URL("../carmen/timo.png", import.meta.url)).toString("base64")}`;

// note: same warm palette as carmen's phone; the family reads this on a phone, often in a hurry
const STYLE = `
${FONT_FACES}
:root { --bg: #f4f6f3; --card: #ffffff; --text: #14231b; --dim: #5b6a61; --line: #d9e0da;
  --ok: #1c6739; --ok-soft: #e3efe6; --stop: #b8321f; --stop-soft: #fbe9e5; --wait: #9a5b00; --wait-soft: #fcf0dc; --stage: #0f1a22; --frame: #1d2a33; }
* { box-sizing: border-box; }
html, body { height: 100%; }
body { margin: 0; background: var(--bg); color: var(--text); font: 17px/1.45 ${SANS}; }
.mono { font-family: ${MONO}; }
main { max-width: 520px; margin: 0 auto; padding: 18px 16px 40px; }
header { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
header img { width: 44px; height: 44px; border-radius: 22%; }
header b { display: block; font-size: 19px; font-weight: 800; } header span { color: var(--dim); font-size: 14px; }
h2 { font-size: 17px; font-weight: 800; margin: 28px 0 10px; }
.quiet { background: var(--ok-soft); border-radius: 16px; padding: 18px; display: flex; gap: 14px; align-items: center; }
.quiet b { color: var(--ok); display: block; font-size: 19px; }
.quiet p { margin: 2px 0 0; font-size: 15px; color: var(--dim); }
.quiet .dot { flex: none; width: 14px; height: 14px; border-radius: 50%; background: var(--ok); }
.ask { background: var(--card); border: 2px solid var(--wait); border-radius: 22px; box-shadow: 0 14px 34px rgba(154,91,0,.16); overflow: hidden; animation: arrive .35s ease-out; }
@keyframes arrive { from { transform: translateY(12px); opacity: 0; } }
.ask .band { background: var(--wait-soft); color: var(--wait); font-weight: 800; padding: 12px 18px; font-size: 17px; display: flex; justify-content: space-between; gap: 8px; }
.ask .band .mono { font-weight: normal; }
.ask .body { padding: 16px 18px 18px; }
.money { font-size: 46px; font-weight: 700; line-height: 1.1; }
.money small { font-size: 20px; color: var(--dim); font-weight: normal; }
.who { font-size: 21px; margin: 4px 0 14px; overflow-wrap: anywhere; }
.why { background: var(--stop-soft); border-radius: 12px; padding: 12px 14px; margin: 0 0 14px; }
.why b { color: var(--stop); display: block; font-size: 15px; font-weight: 800; }
.facts { display: grid; gap: 8px; margin: 0 0 14px; }
.fact { display: grid; grid-template-columns: 7.2em 1fr; gap: 10px; font-size: 15px; align-items: baseline; }
.fact dt { color: var(--dim); } .fact dd { margin: 0; overflow-wrap: anywhere; }
.tag { display: inline-block; font-size: 12px; font-weight: bold; padding: 1px 8px; border-radius: 99px; margin-left: 6px; vertical-align: 1px; }
.tag.bad { background: var(--stop-soft); color: var(--stop); } .tag.good { background: var(--ok-soft); color: var(--ok); }
.flag { border-left: 4px solid var(--stop); padding: 6px 12px; margin: 0 0 14px; font-size: 15px; }
.steps { list-style: none; padding: 0; margin: 0; display: grid; gap: 12px; counter-reset: step; }
.steps > li { counter-increment: step; display: grid; grid-template-columns: 30px 1fr; gap: 10px; align-items: start; font-size: 16px; }
.steps > li::before { content: counter(step); width: 30px; height: 30px; border-radius: 50%; background: var(--wait-soft); color: var(--wait); display: grid; place-items: center; font-weight: bold; font-size: 15px; }
.call { font-size: 22px; font-weight: bold; display: block; margin-top: 2px; }
.check { display: flex; gap: 10px; align-items: flex-start; cursor: pointer; }
.check input { width: 24px; height: 24px; margin: 0; flex: none; accent-color: var(--ok); }
.field { display: block; margin-top: 10px; font-size: 14px; color: var(--dim); }
.hint { color: var(--dim); font-size: 14px; margin: -2px 0 0; text-align: center; }
.hint:empty { display: none; }
.phone { width: 100%; font: inherit; font-size: 18px; padding: 12px; margin-top: 4px; border: 1px solid var(--line); border-radius: 10px; background: var(--bg); color: var(--text); }
.buttons { display: grid; gap: 10px; }
button { font: inherit; font-weight: 800; font-size: 19px; padding: 16px; border-radius: 14px; cursor: pointer; border: 2px solid transparent; }
button.approve { background: var(--ok); color: #fff; }
button.decline { background: transparent; border-color: var(--stop); color: var(--stop); }
button:disabled { opacity: .3; cursor: not-allowed; }
.timer { color: var(--dim); font-size: 13px; margin-top: 12px; text-align: center; }
.error { color: var(--stop); font-size: 15px; margin: 8px 0 0; }
.evidence { display: inline-block; margin: 0 0 14px; color: var(--text); font-size: 15px; }
.done { border-radius: 14px; padding: 14px 16px; margin-bottom: 10px; font-size: 16px; }
.done.yes { background: var(--ok-soft); } .done.no { background: var(--stop-soft); }
.events { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
.events li { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; display: grid; grid-template-columns: auto 1fr; gap: 4px 10px; font-size: 15px; }
.events .what { font-weight: bold; font-size: 12px; letter-spacing: .05em; padding: 2px 8px; border-radius: 99px; align-self: start; }
.what.allow { background: var(--ok-soft); color: var(--ok); } .what.deny { background: var(--stop-soft); color: var(--stop); } .what.ask { background: var(--wait-soft); color: var(--wait); }
.events .rule { grid-column: 2; color: var(--dim); font-size: 12px; }
.events li.none { display: block; color: var(--dim); border-style: dashed; }
.payees { list-style: none; padding: 0; margin: 0; background: var(--card); border: 1px solid var(--line); border-radius: 12px; }
.payees li { padding: 10px 12px; border-bottom: 1px solid var(--line); display: grid; grid-template-columns: 1fr auto; gap: 2px 10px; font-size: 15px; }
.payees li:last-child { border-bottom: 0; }
.payees .sub { color: var(--dim); font-size: 13px; }
.note { color: var(--dim); font-size: 13px; margin: 8px 0 0; }
.chain { color: var(--dim); font-size: 12px; margin-top: 26px; text-align: center; }
.chain.broken { color: var(--stop); font-weight: bold; font-size: 15px; }
.overlay { position: fixed; inset: 0; background: var(--bg); display: none; flex-direction: column; z-index: 5; }
.overlay.open { display: flex; } .overlay iframe { flex: 1; border: 0; background: #fff; }
.overlay button { border-radius: 0; background: var(--card); color: var(--text); }
.aside { display: none; }
/* note: on a wide screen (the demo, a laptop) the same app sits in a phone frame with who-is-who beside it */
@media (min-width: 1000px) and (min-height: 700px) {
  body { background: var(--stage); display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; height: 100vh; overflow: hidden; }
  .aside { display: block; grid-column: 1; justify-self: end; max-width: 460px; padding: 0 56px; }
  .aside { color: #e8efe9; max-width: 420px; padding: 0 64px; }
  .aside h1 { font-size: 46px; line-height: 1.08; margin: 0 0 12px; font-weight: 800; }
  .aside p { color: #9fb1a6; font-size: 22px; margin: 0; }
  main { grid-column: 2; width: 400px; height: min(860px, calc(100vh - 32px)); overflow-y: auto; background: var(--bg);
    border: 11px solid var(--frame); border-radius: 52px; box-shadow: 0 0 0 1px #2c3b45, 0 40px 90px rgba(0,0,0,.55); padding: 26px 16px 32px; scrollbar-width: none; }
  .overlay { inset: auto; left: 50%; top: 50%; width: 400px; height: min(860px, calc(100vh - 32px)); transform: translate(-50%, -50%); border-radius: 46px; overflow: hidden; border: 10px solid #000; }
}
`;

// note: no data in the html; the script fetches it after the link's token becomes a cookie
export function renderDesk(nonce: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Timo for the family</title><style>${STYLE}</style></head><body>
<div class="aside"><h1>Ana, her daughter</h1><p>Timo asks her only when a payment can't be traced.</p></div>
<main>
<header><img src="${FACE}" alt=""><div><b>Timo for the family</b><span>Carmen's payments</span></div></header>
<div id="asks"></div>
<h2>Today</h2>
<ol class="events" id="log"></ol>
<h2>People Carmen pays</h2>
<ul class="payees" id="ledger"></ul>
<p class="note">Only you add people here. Timo never changes the account of someone already on this list.</p>
<p class="chain mono" id="status">connecting</p>
</main>
<div class="overlay" id="overlay"><button id="close-overlay">Close</button><iframe id="evidence" title="What Timo saw"></iframe></div>
<script nonce="${nonce}">${CLIENT}</script></body></html>`;
}

const CLIENT = `
const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => { const node = Object.assign(document.createElement(tag), props); node.append(...kids); return node; };
const VIA = { email: "an email", page: "a web page", pdf: "a PDF", photo: "a photographed letter" };
const SAYS = { "payment-change": "says the bank account changed", pressure: "pushes to pay now", elsewhere: "sends you to pay or log in elsewhere", "ai-instruction": "gives orders to the assistant", secrecy: "asks to keep it secret" };
const WHAT = { allow: "Paid", deny: "Stopped", ask: "Asked you" };
const RULE_WORDS = {
  "payee-drift": "the account was swapped", "brand-impostor": "a copied website", "payee-new": "someone new",
  "amount-unbacked": "an unusually high amount", "amount-disputed": "two different amounts", "payee-repeat": "the same bill again",
  "amount-unverified": "an amount the company's site does not show", "value-untraced": "details from nowhere Timo can check",
  "secret-off-domain": "a password asked off the bank", "commit-outside-gate": "a page paying by itself", "reader-escalation": "a message pushing a payment",
};
let shown = null;
let lastAnswer = null;

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
  setTimeout(poll, 1000);
}

function draw(state) {
  $("status").className = "chain mono" + (state.chain.ok ? "" : " broken");
  $("status").textContent = state.chain.ok ? "log intact · " + state.log.length + " checks · head " + state.chain.head : "Log broken at line " + state.chain.line + ". Do not trust it.";
  const key = state.pending.map((ask) => ask.seq).join(",");
  if (key !== shown) {
    shown = key;
    const quiet = el("div", { className: "quiet" }, el("span", { className: "dot" }), el("div", {}, el("b", { textContent: "Nothing needs you" }),
      el("p", { textContent: "Timo asks here only when a payment does not trace to Carmen or her list." })));
    const answered = lastAnswer ? [el("div", { className: "done " + (lastAnswer.isApproved ? "yes" : "no"), textContent: lastAnswer.text })] : [];
    $("asks").replaceChildren(...(state.pending.length ? state.pending.map(drawAsk) : [...answered, quiet]));
  }
  for (const timer of document.querySelectorAll("[data-expires]")) {
    const left = Math.max(0, Date.parse(timer.dataset.expires) - Date.now());
    timer.textContent = "If nobody answers, Timo says no in " + Math.floor(left / 60000) + ":" + String(Math.floor(left / 1000) % 60).padStart(2, "0");
  }
  $("ledger").replaceChildren(...state.ledger.map((payee) => el("li", {},
    el("span", { textContent: payee.name }),
    el("span", { className: "mono", textContent: "···" + payee.accountEnd }),
    el("span", { className: "sub", textContent: payee.domains.join(", ") }),
    el("span", { className: "sub mono", textContent: payee.phone }))));
  if (state.log.length === 0) $("log").replaceChildren(el("li", { className: "none", textContent: "No payments yet today." }));
  else $("log").replaceChildren(...state.log.slice().reverse().map((entry) => el("li", {},
    el("span", { className: "what " + entry.kind, textContent: WHAT[entry.kind] }),
    el("span", { textContent: (entry.rule ? RULE_WORDS[entry.rule] ?? entry.rule : "as Carmen asked") + " · " + entry.target
      + (entry.answer ? " · " + (entry.answer.isApproved ? "approved" : "declined") + " by " + (entry.answer.by === "guardian" ? "you" : entry.answer.by) : "") }),
    entry.rule ? el("span", { className: "rule mono", textContent: entry.rule }) : "")));
}

function drawAsk(ask) {
  const who = ask.payeeName ?? ask.beneficiary ?? "someone Carmen never paid";
  const isNew = ask.rule === "payee-new";
  const facts = el("dl", { className: "facts" });
  const fact = (term, ...value) => facts.append(el("div", { className: "fact" }, el("dt", { textContent: term }), el("dd", {}, ...value)));
  if (ask.formAccountEnd) fact("Account", el("span", { className: "mono", textContent: "···" + ask.formAccountEnd }),
    ask.knownAccountEnd && ask.knownAccountEnd !== ask.formAccountEnd ? el("span", { className: "tag bad", textContent: "Carmen's list says ···" + ask.knownAccountEnd })
    : ask.knownAccountEnd ? el("span", { className: "tag good", textContent: "on Carmen's list" }) : el("span", { className: "tag bad", textContent: "not on Carmen's list" }));
  if (ask.sourceVia) fact("Came from", (VIA[ask.sourceVia] ?? ask.sourceVia) + (ask.sourceDomain ? " from " : ""), ask.sourceDomain ? el("span", { className: "mono", textContent: ask.sourceDomain }) : "");
  const flags = ask.flags.map((flag) => el("div", { className: "flag" }, el("b", { textContent: "A second check noticed it " + (SAYS[flag.reason] ?? flag.reason) + ": " }), el("q", { textContent: flag.quote })));
  const approve = el("button", { className: "approve", textContent: isNew ? "Approve and add to Carmen's list" : "Approve this one payment", disabled: true });
  const decline = el("button", { className: "decline", textContent: "Decline, don't pay" });
  const checked = el("input", { type: "checkbox" });
  const phone = el("input", { className: "phone mono", type: "tel", placeholder: "e.g. 600 123 456", autocomplete: "off" });
  const error = el("p", { className: "error" });
  const hint = el("p", { className: "hint" });
  const sync = () => {
    const missing = !checked.checked ? (isNew ? "Tick the box and type the number you called to approve." : "Tick the box to approve.")
      : isNew && phone.value.trim().length < 6 ? "Type the number you called; it goes on Carmen's list with them." : "";
    approve.disabled = missing !== "";
    hint.textContent = missing;
  };
  checked.addEventListener("change", sync);
  phone.addEventListener("input", sync);
  const answer = async (isApproved) => {
    approve.disabled = decline.disabled = true;
    const addToLedger = isApproved && isNew ? { phone: phone.value } : undefined;
    const res = await fetch("/api/answer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ seq: ask.seq, isApproved, addToLedger }) });
    if (res.status === 409 && addToLedger) { error.textContent = (await res.json()).error; sync(); decline.disabled = false; return; }
    lastAnswer = { isApproved: res.ok && isApproved, text: !res.ok ? "That payment was no longer waiting." : addToLedger ? "Approved. " + who + " is now on Carmen's list, and Timo pays this bill." : isApproved ? "Approved. Timo sends that exact payment once." : "Declined. Nothing was sent, and Carmen will hear why." };
  };
  approve.addEventListener("click", () => answer(true));
  decline.addEventListener("click", () => answer(false));
  const callWho = ask.payeePhone
    ? el("li", {}, el("div", {}, "Call " + who + " on the number from Carmen's list", el("span", { className: "call mono", textContent: ask.payeePhone })))
    : el("li", {}, el("div", {}, "Call " + who + " on a number you already had. Not one from the message."));
  const confirm = el("li", {}, el("div", {}, el("label", { className: "check" }, checked, el("span", { textContent: "I called and they confirmed this payment." })),
    isNew ? el("label", { className: "field" }, el("span", { textContent: "The number you called" }), phone) : ""));
  const timer = el("div", { className: "timer mono" });
  timer.dataset.expires = ask.expiresAt;
  sync();
  const evidence = ask.lensHref ? el("a", { className: "evidence", href: "#", textContent: "See what Timo saw", onclick: (event) => { event.preventDefault(); $("evidence").src = ask.lensHref; $("overlay").classList.add("open"); } }) : "";
  return el("section", { className: "ask" },
    el("div", { className: "band" }, el("span", { textContent: "Timo is holding a payment" }), el("span", { className: "mono", textContent: "#" + ask.seq })),
    el("div", { className: "body" },
      el("div", { className: "money mono" }, ask.amount ?? "?", el("small", { textContent: " EUR" })),
      el("div", { className: "who", textContent: "to " + who }),
      el("div", { className: "why" }, el("b", { textContent: "Why Timo stopped" }), el("span", { textContent: "This looks like " + ask.scam + "." })),
      facts, ...flags, evidence,
      el("ol", { className: "steps" }, callWho, confirm, el("li", {}, el("div", { className: "buttons" }, approve, hint, decline))),
      error, timer));
}

$("close-overlay").addEventListener("click", () => { $("overlay").classList.remove("open"); $("evidence").src = "about:blank"; });
start();
`;
