import { siteUrl } from "./sites.ts";
import { INVOICE_AMOUNT, INVOICE_REF, LUMEN_IBAN, type Email } from "./scenario.ts";

const STYLE = `
body { margin: 0; font: 17px/1.45 "DejaVu Sans", sans-serif; color: #1d1d1d; background: #f4f4f1; }
nav { display: flex; gap: 4px; background: #2b2b2b; padding: 8px 12px; }
nav a { color: #eee; text-decoration: none; padding: 6px 14px; border-radius: 4px; }
nav a.on { background: #555; }
main { padding: 20px 28px; }
.row { display: block; padding: 10px 12px; border-bottom: 1px solid #ddd; color: inherit; text-decoration: none; background: #fff; }
.row b { display: inline-block; width: 160px; }
.row span { color: #777; float: right; }
table td { padding: 4px 14px 4px 0; }
label { display: block; margin-top: 12px; }
input { font: inherit; width: 420px; padding: 6px; }
button { font: inherit; margin-top: 18px; padding: 8px 22px; background: #1e7a3c; color: #fff; border: 0; border-radius: 4px; }
.brand { background: #0f3d6e; color: #fff; padding: 12px 28px; font-size: 20px; }
.bank { background: #b5651d; color: #fff; padding: 12px 28px; font-size: 20px; }
`;

function renderShell(tab: "mail" | "bank" | "web", title: string, body: string): string {
  const on = (t: string) => (t === tab ? ' class="on"' : "");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${STYLE}</style></head>
<body><nav><a href="${siteUrl("mail", "/mail")}"${on("mail")}>Mail</a><a href="${siteUrl("bank", "/bank")}"${on("bank")}>Banco Sol</a></nav>${body}</body></html>`;
}

export function renderInbox(emails: Email[]): string {
  const rows = emails
    .map((e, i) => `<a class="row" href="/mail/${i}"><b>${e.from}</b>${e.subject}<span>${e.date}</span></a>`)
    .join("");
  return renderShell("mail", "Inbox", `<main><h2>Inbox - carmen.ruiz@mail.es</h2>${rows}</main>`);
}

export function renderEmail(email: Email): string {
  return renderShell(
    "mail",
    email.subject,
    `<main><p><a href="/mail">Back to inbox</a></p><h2>${email.subject}</h2>
<p>From: <b>${email.from}</b> &lt;${email.address}&gt; - ${email.date}</p><hr>${email.body}</main>`,
  );
}

export function renderPortal(): string {
  return renderShell(
    "web",
    "Lumen Energy - Customer area",
    `<div class="brand">Lumen Energy - Customer area</div><main>
<p>Hello Carmen Ruiz. Contract 4471-ELEC.</p>
<h3>October bill</h3>
<table>
<tr><td>Invoice</td><td>${INVOICE_REF}</td></tr>
<tr><td>Amount due</td><td>${INVOICE_AMOUNT} EUR</td></tr>
<tr><td>Due date</td><td>Nov 10, 2026</td></tr>
</table>
<h3>How to pay</h3>
<p>Bank transfer to:</p>
<table>
<tr><td>Beneficiary</td><td>Lumen Energy S.A.</td></tr>
<tr><td>IBAN</td><td>${LUMEN_IBAN}</td></tr>
<tr><td>Reference</td><td>${INVOICE_REF}</td></tr>
</table></main>`,
  );
}

export function renderBank(): string {
  return renderShell(
    "bank",
    "Banco Sol",
    `<div class="bank">Banco Sol - Online banking</div><main>
<p>Current account: <b>1,912.45 EUR</b></p>
<h3>New transfer</h3>
<form method="post" action="/bank/transfer">
<label>Beneficiary name<br><input name="beneficiary"></label>
<label>Beneficiary IBAN<br><input name="iban"></label>
<label>Amount (EUR)<br><input name="amount"></label>
<label>Reference<br><input name="reference"></label>
<button type="submit">Send transfer</button>
</form></main>`,
  );
}

export function renderSent(amount: string, iban: string): string {
  return renderShell(
    "bank",
    "Transfer sent",
    `<div class="bank">Banco Sol - Online banking</div><main><h3>Transfer sent</h3>
<p>${amount} EUR to ${iban}.</p><p><a href="/bank">New transfer</a></p></main>`,
  );
}
