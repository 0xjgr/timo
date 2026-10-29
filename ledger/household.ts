import { compactIban } from "../provenance/iban.ts";
import { LUMEN_IBAN } from "../world/scenario.ts";
import type { Payee } from "./payee.ts";

// note: carmen's confirmed payees; in the product only the guardian page writes this
export const HOUSEHOLD_LEDGER: Payee[] = [{
  id: "lumen",
  name: "Lumen Energy S.A.",
  iban: compactIban(LUMEN_IBAN),
  domains: ["lumen-energy.es"],
  phone: "+34 900 100 200",
  amountRange: { min: 40, max: 120 },
  logoHash: "f8d0b0f0f090f0e0",
}];
