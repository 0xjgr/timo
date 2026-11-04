import { mkdir, writeFile } from "node:fs/promises";
import type { Page } from "playwright";
import type { FormField } from "../gate/pending-form.ts";
import type { VerdictEntry } from "../gate/verdict-log.ts";
import { normalizeAmount } from "../provenance/amount.ts";
import { compactIban } from "../provenance/iban.ts";
import type { Trace } from "../provenance/trace.ts";
import type { LogoMatch } from "../sam/brand-watch.ts";
import { renderLens, type LensPage } from "./render.ts";
import type { Mark, Rect, SnapshotBook } from "./snapshots.ts";

export type Lens = {
  // note: only for ask and deny, an allow needs no explaining
  record: (entry: VerdictEntry, page: Page, fields: FormField[]) => Promise<void>;
};

type LensContext = { dir: string; book: SnapshotBook; findLogo: (sourceId: string) => LogoMatch | undefined };

export function openLens(context: LensContext): Lens {
  return {
    record: async (entry, page, fields) => {
      if (entry.verdict.kind === "allow") return;
      await mkdir(context.dir, { recursive: true });
      const stem = `verdict-${entry.seq}`;
      const commitPng = await captureCommit(entry, page);
      if (commitPng) await writeFile(`${context.dir}/${stem}-commit.png`, commitPng);
      const lensPage: LensPage = {
        entry,
        commitImage: commitPng && { file: `${stem}-commit.png`, ...readPngSize(commitPng) },
        fields: entry.commit.values.map((trace) => ({ trace, rect: findFieldRect(trace, fields), isVouched: isVouched(trace) })),
        sources: [],
      };
      const sourceIds = new Set([
        ...entry.commit.values.filter((trace) => !isVouched(trace)).flatMap((trace) => trace.origins.flatMap((origin) => (origin.kind === "foreign" ? [origin.sourceId] : []))),
        ...entry.commit.impostors.map((impostor) => impostor.sourceId),
      ]);
      for (const sourceId of sourceIds) {
        const snapshot = context.book.find(sourceId);
        if (!snapshot) continue;
        const file = `${stem}-source-${lensPage.sources.length}.png`;
        await writeFile(`${context.dir}/${file}`, snapshot.png);
        const logo = context.findLogo(sourceId);
        const marks: Mark[] = [
          ...snapshot.marks.filter((mark) => entry.commit.values.some((trace) => isSameValue(trace, mark.text))),
          ...(logo ? [{ text: `${logo.payeeId} logo, ${logo.distance}/64 bits from your ledger`, rect: toRect(logo.region), mask: logo.region.mask }] : []),
        ];
        lensPage.sources.push({ source: snapshot.source, image: { file, ...readPngSize(snapshot.png) }, marks });
      }
      await writeFile(`${context.dir}/${stem}.html`, renderLens(lensPage));
      console.log(`[lens] wrote ${context.dir}/${stem}.html sources=${lensPage.sources.length}`);
    },
  };
}

// note: a network verdict holds the very request the page is navigating on, so a screenshot would wait on itself
async function captureCommit(entry: VerdictEntry, page: Page): Promise<Buffer | undefined> {
  if (entry.commit.via === "network") return undefined;
  return page.screenshot({ timeout: 5000, scale: "css" }).catch((error: unknown) => {
    console.log(`[lens] no commit shot seq=${entry.seq} reason="${error instanceof Error ? error.message.split("\n")[0] : String(error)}"`);
    return undefined;
  });
}

function isVouched(trace: Trace): boolean {
  return trace.origins.some((origin) => origin.kind === "request" || origin.kind === "ledger");
}

function isSameValue(trace: Trace, text: string): boolean {
  if (trace.kind === "iban") return compactIban(text) === trace.value;
  if (trace.kind === "amount") return normalizeAmount(text) === trace.value;
  return text.trim() === trace.value;
}

function findFieldRect(trace: Trace, fields: FormField[]): Rect | undefined {
  return fields.find((field) => (trace.kind === "iban" ? compactIban(field.value).includes(trace.value) : isSameValue(trace, field.value)))?.rect;
}

function toRect(region: { left: number; top: number; right: number; bottom: number }): Rect {
  return { x: region.left, y: region.top, width: region.right - region.left, height: region.bottom - region.top };
}

// note: width and height sit at fixed offsets in the png header
function readPngSize(png: Buffer): { width: number; height: number } {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}
