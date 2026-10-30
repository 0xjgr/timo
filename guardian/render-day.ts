import type { VerdictEntry } from "../gate/verdict-log.ts";
import type { Payee } from "../ledger/payee.ts";

export type ChainState = { ok: true; head: string } | { ok: false; line: number; reason: string };

export type GuardianDay = {
  title: string;
  chain: ChainState;
  entries: { entry: VerdictEntry; lensHref?: string; cardHref?: string }[];
  ledger: Payee[];
};

const STYLE = `
:root { --bg: #111312; --panel: #1a1d1b; --line: #2c312e; --text: #e6e8e3; --dim: #8d948f;
  --deny: #ff5a4e; --ask: #f2b705; --ok: #4cc38a; }
@media (prefers-color-scheme: light) { :root { --bg: #f4f4f1; --panel: #ffffff; --line: #d9dbd5; --text: #1b1d1c; --dim: #5f6661;
  --deny: #c62f24; --ask: #9a6b00; --ok: #1f7a4a; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.5 "DejaVu Sans", system-ui, sans-serif; }
main { max-width: 1000px; margin: 0 auto; padding: 24px 16px 48px; }
code, .mono, td { font-family: "DejaVu Sans Mono", ui-monospace, monospace; }
h1 { font-size: 20px; margin: 0 0 6px; }
h2 { font-size: 13px; color: var(--dim); text-transform: uppercase; letter-spacing: .08em; margin: 30px 0 10px; }
.chain { padding: 10px 14px; border: 1px solid var(--line); background: var(--panel); font-size: 14px; }
.chain.ok b { color: var(--ok); } .chain.broken { border-color: var(--deny); } .chain.broken b { color: var(--deny); }
.scroll { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: 13px; }
td, th { text-align: left; padding: 7px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { color: var(--dim); font-weight: normal; font-family: inherit; }
.kind, .rule { font-weight: bold; letter-spacing: .05em; white-space: nowrap; } .rule { font-weight: normal; letter-spacing: 0; }
.allow { color: var(--ok); } .ask { color: var(--ask); } .deny { color: var(--deny); }
.reason { font-family: inherit; min-width: 260px; }
a { color: inherit; }
.note { color: var(--dim); font-size: 13px; margin: 8px 0 0; }
`;

export function renderDay(day: GuardianDay): string {
  const counts = (kind: string) => day.entries.filter(({ entry }) => entry.verdict.kind === kind).length;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Timo guardian</title><style>${STYLE}</style></head><body><main>
<h1>${escapeHtml(day.title)}</h1>
<div class="mono" style="color:var(--dim)">${day.entries.length} commits checked · ${counts("allow")} allowed · ${counts("ask")} asked you · ${counts("deny")} stopped</div>
<h2>Verdict log</h2>
${renderChain(day.chain)}
<div class="scroll"><table>
<tr><th>#</th><th>Time</th><th>Verdict</th><th>Rule</th><th class="reason">Why</th><th>Where</th><th>Evidence</th></tr>
${day.entries.map(renderRow).join("\n")}
</table></div>
<h2>Your ledger</h2>
<div class="scroll"><table>
<tr><th>Payee</th><th>Account</th><th>Websites</th><th>Usual amount</th><th>Phone</th></tr>
${day.ledger.map((payee) => `<tr><td>${escapeHtml(payee.name)}</td><td>…${payee.iban.slice(-4)}</td><td>${payee.domains.map(escapeHtml).join(", ")}</td><td>${payee.amountRange.min}-${payee.amountRange.max} EUR</td><td>${escapeHtml(payee.phone)}</td></tr>`).join("\n")}
</table></div>
<p class="note">Only you change the ledger. If a payee says it changed bank, call the phone number above before adding the new account, never a number from the message.</p>
</main></body></html>`;
}

function renderChain(chain: ChainState): string {
  if (chain.ok) return `<div class="chain ok"><b>Intact.</b> Every entry carries the hash of the one before; head <code>${chain.head.slice(0, 12)}</code>. Check it yourself with <code>npm run verify</code>.</div>`;
  return `<div class="chain broken"><b>Broken at line ${chain.line}:</b> ${escapeHtml(chain.reason)}. Entries from there on cannot be trusted and are not shown.</div>`;
}

function renderRow({ entry, lensHref, cardHref }: GuardianDay["entries"][number]): string {
  const { verdict, commit } = entry;
  const links = [lensHref && `<a href="${lensHref}">lens</a>`, cardHref && `<a href="${cardHref}">card</a>`].filter(Boolean).join(" · ");
  return `<tr><td>${entry.seq}</td><td>${entry.at.slice(11, 19)}</td><td class="kind ${verdict.kind}">${verdict.kind.toUpperCase()}</td>
<td class="rule">${verdict.kind === "allow" ? "" : verdict.rule}</td><td class="reason">${verdict.kind === "allow" ? "every value traced to you, your ledger or the payee's own site" : escapeHtml(verdict.reason)}</td>
<td>${escapeHtml(commit.targetDomain)} via ${commit.via}</td><td>${links}</td></tr>`;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}
