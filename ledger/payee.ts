export type Payee = {
  id: string;
  name: string;
  // note: compact form, no spaces, as compactIban returns it
  iban: string;
  domains: string[];
  phone: string;
  amountRange: { min: number; max: number };
  // note: where their current bill shows on their own site, typed by the guardian; timo opens it itself, never from a link it read
  billUrl?: string;
  // note: difference hash of the logo on their own site, see ledger/capture-logo.ts
  logoHash?: string;
};
