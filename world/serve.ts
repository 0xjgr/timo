import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { LUMEN_LOGO_SVG } from "./logo.ts";
import { listEmails, type Email } from "./inbox.ts";
import { readFile } from "node:fs/promises";
import { renderInvoicePdf } from "./invoice-pdf.ts";
import { renderAttachment, renderBank, renderClonePortal, renderEmail, renderInbox, renderMailSent, renderPortal, renderReply, renderSent } from "./pages.ts";
import type { Scenario } from "./scenario.ts";
import { findSite, mapHostsTo, siteUrl } from "./sites.ts";

export type Transfer = { beneficiary: string; iban: string; amount: string; reference: string };

export type Message = { to: string; subject: string; body: string };

export type World = { startUrl: string; hostRules: string; transfers: Transfer[]; messages: Message[]; close: () => Promise<void> };

export async function startWorld(scenario: Scenario, crafted?: Email): Promise<World> {
  const emails = listEmails(scenario, crafted);
  const transfers: Transfer[] = [];
  const messages: Message[] = [];

  const server = createServer(async (req, res) => {
    const path = req.url ?? "/";
    const site = findSite(req.headers.host ?? "");
    const send = (html: string, status = 200) => {
      res.writeHead(status, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
    };

    const readForm = (onForm: (form: URLSearchParams) => void) => {
      let raw = "";
      req.on("data", (chunk) => (raw += chunk));
      req.on("end", () => onForm(new URLSearchParams(raw)));
    };

    if (req.method === "POST" && site === "bank" && path === "/bank/transfer") {
      return readForm((form) => {
        const transfer: Transfer = {
          beneficiary: form.get("beneficiary") ?? "",
          iban: form.get("iban") ?? "",
          amount: form.get("amount") ?? "",
          reference: form.get("reference") ?? "",
        };
        transfers.push(transfer);
        console.log(`[world] transfer iban="${transfer.iban}" amount=${transfer.amount}`);
        send(renderSent(transfer.amount, transfer.iban));
      });
    }

    if (req.method === "POST" && site === "mail" && path === "/mail/send") {
      return readForm((form) => {
        const message: Message = { to: form.get("to") ?? "", subject: form.get("subject") ?? "", body: form.get("body") ?? "" };
        messages.push(message);
        console.log(`[world] mail to="${message.to}" chars=${message.body.length}`);
        send(renderMailSent(message.to));
      });
    }

    const emailMatch = path.match(/^\/mail\/(\d+)(\/reply|\/attachment|\/attachment\.pdf|\/image)?$/);
    const index = Number(emailMatch?.[1]);
    const email = site === "mail" && emailMatch ? emails[index] : undefined;
    const part = emailMatch?.[2];
    if (email && part === "/reply") return send(renderReply(email));
    if (email?.attachment && part === "/attachment") return send(renderAttachment(email, index));
    if (email?.attachment && part === "/attachment.pdf") {
      res.writeHead(200, { "content-type": "application/pdf" });
      return res.end(renderInvoicePdf());
    }
    if (email?.image && part === "/image") {
      res.writeHead(200, { "content-type": "image/jpeg" });
      return res.end(await readFile(new URL(`./images/${email.image}`, import.meta.url)));
    }
    if (email && !part) return send(renderEmail(email, index));
    const pdfjs = site === "mail" ? path.match(/^\/pdfjs\/(pdf\.min\.mjs|pdf\.worker\.min\.mjs)$/)?.[1] : undefined;
    if (pdfjs) {
      res.writeHead(200, { "content-type": "text/javascript" });
      return res.end(await readFile(new URL(import.meta.resolve(`pdfjs-dist/build/${pdfjs}`))));
    }
    if (site === "mail" && (path === "/" || path === "/mail")) return send(renderInbox(emails));
    if (site === "portal" && (path === "/" || path === "/portal")) return send(renderPortal(scenario === "portal-banner"));
    if (site === "bank" && (path === "/" || path === "/bank")) return send(renderBank());
    if (site === "clone" && (path === "/" || path === "/portal")) return send(renderClonePortal());
    if ((site === "portal" || site === "clone") && path === "/logo.svg") {
      res.writeHead(200, { "content-type": "image/svg+xml" });
      return res.end(LUMEN_LOGO_SVG);
    }
    send("not found", 404);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    startUrl: siteUrl("mail", "/mail"),
    hostRules: mapHostsTo(port),
    transfers,
    messages,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
