export type SourceVia = "page" | "email" | "pdf" | "photo";

export type Origin =
  | { kind: "request" }
  | { kind: "ledger"; payeeId: string }
  | { kind: "foreign"; sourceId: string; via: SourceVia; domain: string };

export type ValueKind = "iban" | "amount" | "beneficiary" | "secret" | "login-url";

export type Trace = { kind: ValueKind; value: string; origins: Origin[] };
