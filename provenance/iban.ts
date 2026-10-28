// note: sepa countries the world and the ledger use; an unknown country is skipped, never guessed
const IBAN_LENGTHS: Record<string, number> = {
  BE: 16, DE: 22, ES: 24, FR: 27, GB: 22, IE: 22, IT: 27, NL: 18, PT: 25,
};

const IBAN_START = /(?<![A-Z0-9])[A-Z]{2}\d{2}/g;

export function compactIban(raw: string): string {
  return raw.replace(/[\s ]/g, "").toUpperCase();
}

export function isValidIban(compact: string): boolean {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(compact)) return false;
  if (IBAN_LENGTHS[compact.slice(0, 2)] !== compact.length) return false;
  const rearranged = compact.slice(4) + compact.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const digits = char >= "A" ? String(char.charCodeAt(0) - 55) : char;
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

export function extractIbans(text: string): string[] {
  const upper = text.toUpperCase();
  const found = new Set<string>();
  for (const match of upper.matchAll(IBAN_START)) {
    const length = IBAN_LENGTHS[match[0].slice(0, 2)];
    if (length === undefined) continue;
    const candidate = readGrouped(upper, match.index, length);
    if (candidate !== null && isValidIban(candidate)) found.add(candidate);
  }
  return [...found];
}

// note: accepts the printed form "ES91 2100 ..." with single spaces; anything else ends the read
function readGrouped(text: string, start: number, length: number): string | null {
  let compact = "";
  let index = start;
  while (compact.length < length && index < text.length) {
    const char = text[index]!;
    if (/[A-Z0-9]/.test(char)) compact += char;
    else if (!isSpace(char) || isSpace(text[index - 1] ?? "")) return null;
    index++;
  }
  // threat: a longer token that only starts like an iban is not that iban
  if (compact.length < length || /[A-Z0-9]/.test(text[index] ?? "")) return null;
  return compact;
}

function isSpace(char: string): boolean {
  return char === " " || char === " ";
}
