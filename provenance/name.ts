const LEGAL_FORM = / (?:s ?a ?u?|s ?l ?u?|ltd|gmbh|inc)$/;

export function normalizeText(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// note: "Lumen Energy S.A." and "Lumen Energy" name the same payee
export function normalizeName(raw: string): string {
  return normalizeText(raw).replace(LEGAL_FORM, "");
}
