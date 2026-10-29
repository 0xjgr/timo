import type { Page } from "playwright";
import type { Impostor } from "../gate/commit.ts";
import type { Payee } from "../ledger/payee.ts";
import type { Source } from "../provenance/source-log.ts";
import { decodePng, hashRegion, MAX_LOGO_DISTANCE, measureDistance } from "./logo-hash.ts";
import { SAM_USD_PER_IMAGE, segmentImage, type Region } from "./segment.ts";

export type LogoMatch = { payeeId: string; region: Region; distance: number };

export type BrandWatch = {
  inspect: (page: Page, source: Source) => void;
  // note: the gates wait for inspections in flight, so a fast click cannot beat the check
  settle: () => Promise<void>;
  listImpostors: () => Impostor[];
  readSpentUsd: () => number;
};

// threat: a cloned portal that carries the brand only in pixels, where no text rule can see it
export function openBrandWatch(ledger: Payee[]): BrandWatch {
  const inspected = new Set<string>();
  const impostors = new Map<string, Impostor>();
  const inFlight = new Set<Promise<void>>();
  let spentUsd = 0;

  const check = async (page: Page, source: Source): Promise<void> => {
    const png = await page.screenshot();
    spentUsd += SAM_USD_PER_IMAGE;
    const segmentation = await segmentImage(png, "logo");
    if (!segmentation.ok) {
      // todo: a failed check leaves the page unmarked; the payee-new ask is still the fallback
      console.log(`[brand] error id=${source.id} reason="${segmentation.error.slice(0, 120)}"`);
      return;
    }
    const match = matchLogos(png, segmentation.value, ledger);
    if (!match) {
      console.log(`[brand] clear domain=${source.domain} logos=${segmentation.value.length}`);
      return;
    }
    impostors.set(source.id, { sourceId: source.id, payeeId: match.payeeId, domain: source.domain });
    console.log(`[brand] impostor domain=${source.domain} logo=${match.payeeId} distance=${match.distance}`);
  };

  return {
    inspect: (page, source) => {
      // note: a ledger payee's own domain may show its own logo
      if (ledger.some((payee) => payee.domains.includes(source.domain))) return;
      const key = `${source.id} ${source.domain}`;
      if (inspected.has(key)) return;
      inspected.add(key);
      const running = check(page, source)
        .catch((error: unknown) => console.log(`[brand] skipped id=${source.id} reason="${error instanceof Error ? error.message.split("\n")[0] : String(error)}"`))
        .finally(() => inFlight.delete(running));
      inFlight.add(running);
    },
    settle: async () => {
      while (inFlight.size > 0) await Promise.all(inFlight);
    },
    listImpostors: () => [...impostors.values()],
    readSpentUsd: () => spentUsd,
  };
}

export function matchLogos(png: Buffer, regions: Region[], ledger: Payee[]): LogoMatch | undefined {
  if (regions.length === 0) return undefined;
  const bitmap = decodePng(png);
  for (const region of regions) {
    const hash = hashRegion(bitmap, region);
    for (const payee of ledger) {
      if (!payee.logoHash) continue;
      const distance = measureDistance(hash, payee.logoHash);
      if (distance <= MAX_LOGO_DISTANCE) return { payeeId: payee.id, region, distance };
    }
  }
  return undefined;
}
