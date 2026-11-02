export type SourceVia = "page" | "email" | "pdf" | "photo";

export type Origin =
  | { kind: "request" }
  | { kind: "ledger"; payeeId: string }
  | { kind: "foreign"; sourceId: string; via: SourceVia; domain: string };

export type ValueKind = "iban" | "amount" | "beneficiary" | "secret" | "login-url";

// note: every amount one source states, so the gate can see when a payee's own messages disagree
export type Statement = { sourceId: string; via: SourceVia; domain: string; amounts: string[] };

// note: what timo itself read on a ledger payee's own bill page, outside the agent's browsing
export type BillCheck = { payeeId: string; url: string } & ({ ok: true; amounts: string[] } | { ok: false; error: string });

// note: a payment that already left in this errand, as the network gate saw it go
export type Sent = { iban: string; amount?: string };

export type Trace = { kind: ValueKind; value: string; origins: Origin[] };
