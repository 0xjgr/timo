const NUMBER = /(?<![\d.,])\d+(?:[.,]\d+)*/g;
const CURRENCY_AFTER = /^\s?(?:eur\b|euros?\b|€)/i;
const CURRENCY_BEFORE = /€\s?$/;

// note: "84,20", "84.20", "1.912,45" and "1,912.45" all become "84.20" / "1912.45"
export function normalizeAmount(raw: string): string | null {
  const plain = raw.trim();
  if (!/^\d+(?:[.,]\d+)*$/.test(plain)) return null;
  const cents = /[.,](\d{2})$/.exec(plain);
  const whole = cents ? plain.slice(0, -3) : plain;
  if (!/^\d+$/.test(whole) && !/^\d{1,3}(?:[.,]\d{3})+$/.test(whole)) return null;
  return `${Number(whole.replace(/[.,]/g, ""))}.${cents?.[1] ?? "00"}`;
}

// note: a number counts as an amount only with cents or a currency next to it, so dates and refs stay out
export function extractAmounts(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(NUMBER)) {
    const end = match.index + match[0].length;
    const hasCents = /[.,]\d{2}$/.test(match[0]);
    const hasCurrency = CURRENCY_AFTER.test(text.slice(end, end + 7)) || CURRENCY_BEFORE.test(text.slice(Math.max(0, match.index - 2), match.index));
    if (!hasCents && !hasCurrency) continue;
    const amount = normalizeAmount(match[0]);
    if (amount !== null) found.add(amount);
  }
  return [...found];
}
