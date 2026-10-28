export const RULE_IDS = [
  "value-untraced",
  "payee-drift",
  "secret-off-domain",
  "brand-impostor",
  "commit-outside-gate",
  "payee-new",
  "amount-unbacked",
  "reader-escalation",
] as const;

export type RuleId = (typeof RULE_IDS)[number];

export type Verdict =
  | { kind: "allow" }
  | { kind: "ask"; rule: RuleId; reason: string }
  | { kind: "deny"; rule: RuleId; reason: string };
