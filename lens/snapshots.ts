import type { SegmentationMask } from "@meta-sam/parser";
import type { Page } from "playwright";
import type { Source } from "../provenance/source-log.ts";

export type Rect = { x: number; y: number; width: number; height: number };

// note: text marks come from dom boxes, which are exact; only pixel-only evidence carries a sam mask
export type Mark = { text: string; rect: Rect; mask?: SegmentationMask };

export type Snapshot = { source: Source; png: Buffer; marks: Mark[] };

// note: what each source looked like when timo read it, so a later verdict can point at the pixels
export class SnapshotBook {
  readonly #latest = new Map<string, Snapshot>();

  async capture(page: Page, source: Source): Promise<Buffer> {
    // note: a capture racing a navigation can hang; the lens can do without one page
    const png = await page.screenshot({ timeout: 5000 });
    const marks = await page.evaluate(findValueMarks);
    this.#latest.set(source.id, { source, png, marks });
    return png;
  }

  add(snapshot: Snapshot): void {
    this.#latest.set(snapshot.source.id, snapshot);
  }

  addMarks(sourceId: string, marks: Mark[]): void {
    const snapshot = this.#latest.get(sourceId);
    if (snapshot) snapshot.marks.push(...marks);
  }

  find(sourceId: string): Snapshot | undefined {
    return this.#latest.get(sourceId);
  }
}

// note: runs in the page. loose patterns on purpose, the lens matches them to traced values later
function findValueMarks(): Mark[] {
  const patterns = [/\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,4})?\b/g, /\b\d{1,3}(?:[.,]\d{3})*[.,]\d{2}\b/g];
  const marks: Mark[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent ?? "";
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        const range = document.createRange();
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);
        const box = range.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) continue;
        marks.push({ text: match[0], rect: { x: box.x, y: box.y, width: box.width, height: box.height } });
      }
    }
  }
  return marks;
}
