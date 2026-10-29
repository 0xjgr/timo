import { extractIbans } from "../provenance/iban.ts";
import type { SourceLog } from "../provenance/source-log.ts";
import type { Trace, ValueKind } from "../provenance/trace.ts";
import type { FormField } from "./pending-form.ts";

const LABELS: [ValueKind, RegExp][] = [
  ["iban", /\b(iban|account|cuenta)\b/i],
  ["amount", /\b(amount|importe|total|sum|eur)\b/i],
  ["beneficiary", /(benefici|payee|recipient|destinatari|titular)/i],
];

// note: an iban is found by its shape in any field, labels only add the fields a shape can't catch
export function traceFields(fields: FormField[], log: SourceLog): Trace[] {
  return fields.flatMap((field): Trace[] => {
    if (field.type === "password") return [log.traceValue("secret", field.value)];
    const ibans = extractIbans(field.value);
    if (ibans.length > 0) return ibans.map((iban) => log.traceValue("iban", iban));
    const words = `${field.name} ${field.label}`;
    const kind = LABELS.find(([, pattern]) => pattern.test(words))?.[0];
    // threat: a mistyped iban fails mod-97 and must not slip through as a plain field
    return kind ? [log.traceValue(kind, field.value)] : [];
  });
}
