export type Payee = {
  id: string;
  name: string;
  iban: string;
  domains: string[];
  phone: string;
  amountRange: { min: number; max: number };
};
