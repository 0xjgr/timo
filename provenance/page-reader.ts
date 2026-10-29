import type { Page } from "playwright";
import { domainOfAddress, registrableDomain } from "./domain.ts";
import type { Source, SourceLog } from "./source-log.ts";

// note: an email shown in webmail belongs to its sender, not to the webmail host.
// a real deployment reads mail over imap; here the webmail host is the stand-in
const SENDER_LINE = /^From:.*<([^<>\s]+@[^<>\s]+)>/m;

export function readSource(url: string, text: string, mailHost: string): Source {
  const host = new URL(url).hostname;
  const sender = host === mailHost ? text.match(SENDER_LINE)?.[1] : undefined;
  if (sender) return { id: url, via: "email", domain: domainOfAddress(sender), text };
  return { id: url, via: "page", domain: registrableDomain(host), text };
}

// note: called with every recorded source, e.g. the brand check that looks at its pixels.
// shownAt is the page url that displays it, when that is not the source's own url (a pdf preview)
export type SourceHook = (page: Page, source: Source, shownAt?: string) => void;

export async function recordPage(page: Page, log: SourceLog, mailHost: string, onRecord?: SourceHook): Promise<void> {
  const url = page.url();
  if (!url.startsWith("http")) return;
  const text = await page.evaluate(() => document.body?.innerText ?? "");
  const source = readSource(url, text, mailHost);
  log.record(source);
  console.log(`[source] ${source.via} domain=${source.domain} id=${source.id} chars=${text.length}`);
  onRecord?.(page, source);
}

// threat: a value the agent saw on screen must already be in the log when it reaches a form
export function watchPages(page: Page, log: SourceLog, mailHost: string, onRecord?: SourceHook): void {
  page.on("load", () => {
    recordPage(page, log, mailHost, onRecord).catch((error: unknown) => {
      // note: a page that navigated away mid-read is read again on its own load
      console.log(`[source] skipped url=${page.url()} reason="${error instanceof Error ? error.message.split("\n")[0] : String(error)}"`);
    });
  });
}
