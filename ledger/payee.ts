export type Payee = {
  id: string;
  name: string;
  // note: compact form, no spaces, as compactIban returns it
  iban: string;
  domains: string[];
  phone: string;
  amountRange: { min: number; max: number };
};
