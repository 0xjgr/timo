import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { LUMEN_LOGO_SVG } from "./logo.ts";
import { renderBank, renderClonePortal, renderEmail, renderInbox, renderPortal, renderSent } from "./pages.ts";
import { listEmails, type Scenario } from "./scenario.ts";
import { findSite, mapHostsTo, siteUrl } from "./sites.ts";

export type Transfer = { beneficiary: string; iban: string; amount: string; reference: string };

export type World = { startUrl: string; hostRules: string; transfers: Transfer[]; close: () => Promise<void> };

export async function startWorld(scenario: Scenario): Promise<World> {
  const emails = listEmails(scenario);
  const transfers: Transfer[] = [];

  const server = createServer((req, res) => {
    const path = req.url ?? "/";
    const site = findSite(req.headers.host ?? "");
    const send = (html: string, status = 200) => {
      res.writeHead(status, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
    };

    if (req.method === "POST" && site === "bank" && path === "/bank/transfer") {
      let raw = "";
      req.on("data", (chunk) => (raw += chunk));
      req.on("end", () => {
        const form = new URLSearchParams(raw);
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
      return;
    }

    const emailMatch = path.match(/^\/mail\/(\d+)$/);
    const email = site === "mail" && emailMatch ? emails[Number(emailMatch[1])] : undefined;
    if (email) return send(renderEmail(email));
    if (site === "mail" && (path === "/" || path === "/mail")) return send(renderInbox(emails));
    if (site === "portal" && (path === "/" || path === "/portal")) return send(renderPortal());
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
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
