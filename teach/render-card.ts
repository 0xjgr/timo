import type { VerdictEntry } from "../gate/verdict-log.ts";
import type { Payee } from "../ledger/payee.ts";
import type { RuleId } from "../policy/verdict.ts";
import type { SourceVia } from "../provenance/trace.ts";
import type { Explanation } from "./explain-verdict.ts";
import type { VerdictFacts } from "./verdict-facts.ts";

export type TeachCard = { entry: VerdictEntry; facts: VerdictFacts; explanation: Explanation; payee?: Payee };

// note: written by hand per rule; the phone number comes from the ledger, never from what the agent read
const LESSONS: Record<RuleId, (payee?: Payee) => string> = {
  "payee-drift": (payee) => payee
    ? `Companies almost never change their bank by email. If ${payee.name} says it has, call them on the number you already have: ${payee.phone}.`
    : "Companies almost never change their bank by email. Call them on the number you already have.",
  "brand-impostor": (payee) => `Open ${payee?.name ?? "the company"}'s website yourself, not from a link in an email or a letter.${payee ? ` If in doubt, call ${payee.phone}.` : ""}`,
  "payee-new": () => "Before you pay someone for the first time, your family checks who they are.",
  "amount-unbacked": (payee) => `When a bill is much higher than usual, call ${payee ? `${payee.name} on ${payee.phone}` : "the company"} before paying.`,
  "value-untraced": () => "Timo only pays details that come from you, your records or the bill itself.",
  "secret-off-domain": () => "Your bank never asks for your password on another website.",
  "commit-outside-gate": () => "A real payment page waits for you to press Send. This one tried to pay by itself.",
  "reader-escalation": () => "When a message asks to change who gets paid, your family checks it first.",
};

const SOURCE_NAMES: Record<SourceVia, string> = { email: "email", page: "page", pdf: "PDF", photo: "letter" };

const STYLE = `
:root { --bg: #f7f5f0; --card: #ffffff; --text: #1c1c1a; --dim: #5e5d58; --line: #dedbd2;
  --stop: #b3261e; --stop-soft: #fbeae8; --wait: #8a5a00; --wait-soft: #fbf1dc; --ok: #1e6b3c; --ok-soft: #e6f2ea; }
@media (prefers-color-scheme: dark) { :root { --bg: #161615; --card: #1f1f1d; --text: #ecebe6; --dim: #a5a39b; --line: #36352f;
  --stop: #ff8a80; --stop-soft: #3a1f1d; --wait: #f2c14e; --wait-soft: #352a12; --ok: #7ed39c; --ok-soft: #1a2e21; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 21px/1.5 "DejaVu Sans", system-ui, sans-serif; }
main { max-width: 680px; margin: 0 auto; padding: 32px 16px 48px; }
.brand { font-weight: bold; letter-spacing: .04em; color: var(--dim); font-size: 16px; }
h1 { font-size: 34px; line-height: 1.2; margin: 10px 0 18px; }
.deny h1 { color: var(--stop); } .ask h1 { color: var(--wait); }
.said { font-size: 23px; margin: 0 0 26px; }
.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 0 0 26px; }
.pair div { padding: 14px 16px; border-radius: 10px; }
.pair .known { background: var(--ok-soft); } .pair .asked { background: var(--stop-soft); }
.pair small { display: block; color: var(--dim); font-size: 15px; }
.pair b { font-family: "DejaVu Sans Mono", ui-monospace, monospace; font-size: 26px; }
.lesson { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 16px 18px; margin: 0 0 26px; }
.lesson small { display: block; color: var(--dim); font-size: 15px; text-transform: uppercase; letter-spacing: .06em; }
.safe { font-weight: bold; color: var(--ok); }
footer { margin-top: 36px; color: var(--dim); font: 13px/1.5 "DejaVu Sans Mono", ui-monospace, monospace; overflow-wrap: anywhere; }
@media (max-width: 480px) { .pair { grid-template-columns: 1fr; } h1 { font-size: 28px; } }
`;

export function renderCard(card: TeachCard): string {
  const { entry, facts, explanation, payee } = card;
  const title = facts.kind === "deny" ? "Timo stopped a payment" : "Timo is asking your family";
  const isPairShown = facts.knownAccountEnd && facts.formAccountEnd && facts.knownAccountEnd !== facts.formAccountEnd;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title><style>${STYLE}</style></head><body><main class="${facts.kind}">
<div class="brand">TIMO</div>
<h1>${title}</h1>
<p class="said">${escapeHtml(explanation.text)}</p>
${isPairShown ? `<div class="pair">
<div class="known"><small>${payee ? `${escapeHtml(payee.name)}, in your records` : "In your records"}</small>account ending <b>${facts.knownAccountEnd}</b></div>
<div class="asked"><small>What the ${SOURCE_NAMES[facts.sourceVia ?? "email"]} asked for</small>account ending <b>${facts.formAccountEnd}</b></div>
</div>` : ""}
<div class="lesson"><small>Next time</small>${escapeHtml(LESSONS[facts.rule](payee))}</div>
<p class="safe">${facts.kind === "deny" ? "Nothing was sent. Your money is where it was." : "Nothing is sent until your family answers."}</p>
<footer>verdict ${entry.seq} · rule ${facts.rule} · ${entry.at} · hash ${entry.hash.slice(0, 12)} · words by ${explanation.by === "model" ? "Muse Spark" : "Timo's template"}</footer>
</main></body></html>`;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}
