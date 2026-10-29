import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { Page, Response } from "playwright";
import { readSource, type SourceHook } from "./page-reader.ts";
import type { Source, SourceLog } from "./source-log.ts";

export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const loading = getDocument({ data: bytes });
  const pdf = await loading.promise;
  const pages: string[] = [];
  for (let number = 1; number <= pdf.numPages; number++) {
    const content = await (await pdf.getPage(number)).getTextContent();
    pages.push(content.items.map((item) => ("str" in item ? `${item.str}${item.hasEOL ? "\n" : " "}` : "")).join(""));
  }
  await loading.destroy();
  return pages.join("\n");
}

// threat: a pdf drawn on a canvas never reaches the dom, so the bytes are read as they arrive.
// the pdf belongs to whoever owns the page that fetched it: the sender, for a mail attachment
export function watchPdfs(page: Page, log: SourceLog, mailHost: string, onRecord?: SourceHook): void {
  page.on("response", (response) => {
    if (!(response.headers()["content-type"] ?? "").includes("application/pdf")) return;
    recordPdf(page, response, log, mailHost, onRecord).catch((error: unknown) => {
      console.log(`[source] pdf skipped url=${response.url()} reason="${error instanceof Error ? error.message.split("\n")[0] : String(error)}"`);
    });
  });
}

async function recordPdf(page: Page, response: Response, log: SourceLog, mailHost: string, onRecord?: SourceHook): Promise<void> {
  const frame = response.request().frame();
  const [bytes, ownerText] = await Promise.all([response.body(), frame.evaluate(() => document.body?.innerText ?? "")]);
  const owner = readSource(frame.url(), ownerText, mailHost);
  const source: Source = { id: response.url(), via: "pdf", domain: owner.domain, text: await extractPdfText(new Uint8Array(bytes)) };
  log.record(source);
  console.log(`[source] pdf domain=${source.domain} id=${source.id} chars=${source.text.length}`);
  // note: the preview draws a moment after the bytes land; the snapshot wants the drawn page
  await page.waitForTimeout(800);
  onRecord?.(page, source, frame.url());
}
