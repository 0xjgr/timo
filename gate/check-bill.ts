import type { BrowserContext, Page } from "playwright";
import type { Payee } from "../ledger/payee.ts";
import { extractAmounts } from "../provenance/amount.ts";
import { registrableDomain } from "../provenance/domain.ts";
import type { BillCheck } from "../provenance/trace.ts";

const LOAD_MS = 10_000;

// threat: a taken-over mailbox on the payee's real domain asks for a "corrected" total. the mail can lie about the amount,
// so timo checks it where a careful person would: on the payee's own site, at the address in the ledger, in a browser context of its own
export async function checkBill(page: Page, payee: Payee): Promise<BillCheck | undefined> {
  if (!payee.billUrl) return undefined;
  const url = payee.billUrl;
  if (!payee.domains.includes(registrableDomain(url))) return { payeeId: payee.id, url, ok: false, error: "bill page is off the payee's domains" };
  const browser = page.context().browser();
  if (!browser) return { payeeId: payee.id, url, ok: false, error: "no browser to open the bill page" };
  // note: a context of its own, so nothing the agent's tabs hold or run reaches the check
  let own: BrowserContext | undefined;
  try {
    own = await browser.newContext();
    const tab = await own.newPage();
    await tab.goto(url, { timeout: LOAD_MS });
    const text = await tab.innerText("body", { timeout: LOAD_MS });
    const amounts = extractAmounts(text);
    console.log(`[bill] payee=${payee.id} url=${url} amounts=${amounts.join(",") || "none"}`);
    return { payeeId: payee.id, url, ok: true, amounts };
  } catch (error) {
    // note: playwright throws on a page that does not load; for the gate that is an expected answer, the bill is unchecked
    return { payeeId: payee.id, url, ok: false, error: error instanceof Error ? error.message.split("\n")[0]! : String(error) };
  } finally {
    await own?.close();
  }
}
