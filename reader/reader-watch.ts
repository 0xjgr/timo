import { createHash } from "node:crypto";
import type { Source } from "../provenance/source-log.ts";
import { readSource, type ReaderFlag } from "./read-source.ts";
import type { Chat } from "./spark-open.ts";

export type ReaderWatch = {
  inspect: (source: Source) => void;
  // note: the gates wait for readings in flight, so a fast click cannot beat the reader
  settle: () => Promise<void>;
  listFlags: () => ReaderFlag[];
  readSpentUsd: () => number;
};

// note: ownSites are the household's own bank and webmail pages, written by no stranger
export function openReaderWatch(ownSites: string[] = [], chat?: Chat): ReaderWatch {
  const read = new Set<string>();
  const flags = new Map<string, ReaderFlag>();
  const inFlight = new Set<Promise<void>>();
  let spentUsd = 0;

  const check = async (source: Source): Promise<void> => {
    const reading = await readSource(source, chat);
    spentUsd += reading.ok ? reading.value.spentUsd : reading.spentUsd;
    if (!reading.ok) {
      // todo: a failed reading adds nothing; the rules still decide on their own
      console.log(`[reader] error id=${source.id} reason="${reading.error.slice(0, 120)}"`);
      return;
    }
    const flag = reading.value.flag;
    if (!flag) {
      console.log(`[reader] clear ${source.via} domain=${source.domain}`);
      return;
    }
    flags.set(source.id, flag);
    console.log(`[reader] flag ${source.via} domain=${source.domain} reason=${flag.reason} quote="${flag.quote.slice(0, 80)}"`);
  };

  const inspect = (source: Source): void => {
    if (source.via === "page" && ownSites.includes(source.domain)) return;
    // note: a reload with the same text is read once; a script that rewrites the page is read again
    const key = `${source.id} ${createHash("sha256").update(source.text).digest("hex")}`;
    if (read.has(key) || source.text.trim() === "") return;
    read.add(key);
    const running = check(source).finally(() => inFlight.delete(running));
    inFlight.add(running);
  };

  return {
    inspect,
    settle: async () => {
      while (inFlight.size > 0) await Promise.all(inFlight);
    },
    listFlags: () => [...flags.values()],
    readSpentUsd: () => spentUsd,
  };
}
