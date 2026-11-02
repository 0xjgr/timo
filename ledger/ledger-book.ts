import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import { compactIban } from "../provenance/iban.ts";
import { normalizeName } from "../provenance/name.ts";
import { HOUSEHOLD_LEDGER } from "./household.ts";
import type { Payee } from "./payee.ts";

export type NewPayee = { name: string; iban: string; domain?: string; phone: string; amount?: number };

export type LedgerBook = {
  // note: the same array the gates judge against, so an addition counts from the next commit on
  payees: Payee[];
  addPayee: (candidate: NewPayee) => Promise<{ ok: true; value: Payee } | { ok: false; error: string }>;
};

const PAYEE = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  name: z.string().min(1).max(80),
  iban: z.string().regex(/^[A-Z]{2}[0-9]{2}[A-Z0-9]{8,30}$/),
  domains: z.array(z.string().max(80)).max(10),
  phone: z.string().max(30),
  amountRange: z.object({ min: z.number().nonnegative(), max: z.number().positive() }),
  logoHash: z.string().regex(/^[0-9a-f]{16}$/).optional(),
  billUrl: z.string().url().max(200).optional(),
});

const PHONE = /^\+?[0-9][0-9 ]{5,19}$/;

// note: without a path the book lives in memory and starts from the household seed, as the eval wants
export async function openLedgerBook(path?: string): Promise<LedgerBook> {
  const saved = path ? await readFile(path, "utf8").catch(() => undefined) : undefined;
  const parsed = saved === undefined ? undefined : z.array(PAYEE).safeParse(JSON.parse(saved));
  if (parsed && !parsed.success) throw new Error(`ledger file ${path} does not parse: ${parsed.error.message.slice(0, 200)}`);
  const payees: Payee[] = parsed ? parsed.data : structuredClone(HOUSEHOLD_LEDGER);

  const addPayee: LedgerBook["addPayee"] = async (candidate) => {
    const iban = compactIban(candidate.iban);
    const name = candidate.name.trim().slice(0, 80);
    if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{8,30}$/.test(iban)) return { ok: false, error: "that account number is not valid" };
    if (!PHONE.test(candidate.phone.trim())) return { ok: false, error: "write the phone number you called" };
    // threat: account-change fraud through the back door, a known payee added again with the new account
    const known = payees.find((payee) => payee.iban === iban || normalizeName(payee.name) === normalizeName(name));
    if (known) return { ok: false, error: `${known.name} is already in your ledger; a new account for them is a change, not a new payee` };
    const payee: Payee = {
      id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || `payee-${payees.length}`,
      name,
      iban,
      domains: candidate.domain ? [candidate.domain] : [],
      phone: candidate.phone.trim(),
      // note: the approved amount sets a loose usual range; amount-unbacked asks again past it
      amountRange: { min: 1, max: candidate.amount ? Math.ceil(candidate.amount * 1.5) : 100 },
    };
    payees.push(payee);
    if (path) await writeFile(path, `${JSON.stringify(payees, null, 2)}\n`);
    console.log(`[ledger] added id=${payee.id} iban_end=${iban.slice(-4)} phone_end=${payee.phone.slice(-3)}`);
    return { ok: true, value: payee };
  };

  return { payees, addPayee };
}
