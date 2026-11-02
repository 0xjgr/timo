export type SourceVia = "page" | "email" | "pdf" | "photo";

export type Origin =
  | { kind: "request" }
  | { kind: "ledger"; payeeId: string }
  | { kind: "foreign"; sourceId: string; via: SourceVia; domain: string };

export type ValueKind = "iban" | "amount" | "beneficiary" | "secret" | "login-url";

// note: every amount one source states, so the gate can see when a payee's own messages disagree
export type Statement = { sourceId: string; via: SourceVia; domain: string; amounts: string[] };

export type Trace = { kind: ValueKind; value: string; origins: Origin[] };
