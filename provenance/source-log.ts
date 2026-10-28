import type { Payee } from "../ledger/payee.ts";
import { extractAmounts, normalizeAmount } from "./amount.ts";
import { compactIban, extractIbans } from "./iban.ts";
import { normalizeName, normalizeText } from "./name.ts";
import type { Origin, SourceVia, Trace, ValueKind } from "./trace.ts";

export type Source = { id: string; via: SourceVia; domain: string; text: string };

type Index = { ibans: Set<string>; amounts: Set<string>; words: string };

export class SourceLog {
  readonly #request: Index;
  readonly #ledger: Payee[];
  readonly #sources = new Map<string, { source: Source; index: Index }>();

  constructor(request: string, ledger: Payee[]) {
    this.#request = indexText(request);
    this.#ledger = ledger;
  }

  // note: a reload of the same source replaces it, so a trace never lists one source twice
  record(source: Source): void {
    this.#sources.set(source.id, { source, index: indexText(source.text) });
  }

  listSources(): Source[] {
    return [...this.#sources.values()].map((entry) => entry.source);
  }

  traceValue(kind: ValueKind, raw: string): Trace {
    const value = normalizeValue(kind, raw);
    const origins: Origin[] = [];
    if (isInIndex(this.#request, kind, value)) origins.push({ kind: "request" });
    for (const payee of this.#ledger) {
      if (isPayeeValue(payee, kind, value)) origins.push({ kind: "ledger", payeeId: payee.id });
    }
    for (const { source, index } of this.#sources.values()) {
      if (isInIndex(index, kind, value)) {
        origins.push({ kind: "foreign", sourceId: source.id, via: source.via, domain: source.domain });
      }
    }
    return { kind, value, origins };
  }
}

function indexText(text: string): Index {
  return {
    ibans: new Set(extractIbans(text)),
    amounts: new Set(extractAmounts(text)),
    words: ` ${normalizeText(text)} `,
  };
}

function normalizeValue(kind: ValueKind, raw: string): string {
  if (kind === "iban") return compactIban(raw);
  if (kind === "amount") return normalizeAmount(raw) ?? raw.trim();
  return raw.trim();
}

function isInIndex(index: Index, kind: ValueKind, value: string): boolean {
  switch (kind) {
    case "iban":
      return index.ibans.has(value);
    case "amount":
      return index.amounts.has(value);
    case "beneficiary": {
      const name = normalizeName(value);
      return name !== "" && index.words.includes(` ${name} `);
    }
    case "secret":
    case "login-url":
      // todo: vault secrets and login urls trace through the vault and the ledger, not text
      return false;
  }
}

function isPayeeValue(payee: Payee, kind: ValueKind, value: string): boolean {
  if (kind === "iban") return payee.iban === value;
  if (kind === "beneficiary") return normalizeName(payee.name) === normalizeName(value);
  return false;
}
