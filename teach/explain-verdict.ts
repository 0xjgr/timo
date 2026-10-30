import { createResponse, priceUsage, type ModelId, type Reply } from "../agent/responses.ts";
import type { VerdictFacts } from "./verdict-facts.ts";

export type Explanation = { text: string; by: "model" | "template"; spentUsd: number };

type Ask = (body: Record<string, unknown>) => Promise<Reply>;

const MODEL: ModelId = "muse-spark-1.3-contributor";

const INSTRUCTIONS = `You explain a payment decision to Carmen, who is 78 and not technical.
Talk to her directly as "you". The decision is already made by Timo and you cannot change it.
Write at most two short sentences in plain English, using only the facts in the JSON:
- payeeName: a company Carmen already pays
- knownAccountEnd: last digits of the account that company really uses, from Carmen's own records
- formAccountEnd: last digits of the account this payment would have gone to
- sourceVia and sourceDomain: what Carmen's assistant read that brought this account or amount
- scam: what Timo saw, in plain words
Say an account by its last four digits ("the account ending in 1332"). Never call an account hers.
Never write a full account number, a link, or advice to pay anyway.
If kind is "deny", say the payment was stopped and nothing was sent.
If kind is "ask", say Timo is asking her family before anything is sent.`;

// note: the model only rewords; a deny stays a deny whatever it writes, and a bad answer falls back to the template
export async function explainVerdict(facts: VerdictFacts, ask: Ask = createResponse): Promise<Explanation> {
  const reply = await ask({
    model: MODEL,
    instructions: INSTRUCTIONS,
    input: [{ role: "user", content: [{ type: "input_text", text: JSON.stringify(facts) }] }],
    reasoning: { effort: "low" },
    store: false,
  });
  if (!reply.ok) {
    console.log(`[explain] fallback rule=${facts.rule} reason="${reply.error.slice(0, 80)}"`);
    return { text: writeTemplate(facts), by: "template", spentUsd: 0 };
  }
  const spentUsd = priceUsage(MODEL, reply.value.usage);
  const text = reply.value.output
    .flatMap((item) => (item.type === "message" && "content" in item ? item.content : []))
    .map((part) => part.text ?? "")
    .join(" ")
    .trim();
  const problem = findProblem(text, facts);
  if (problem) {
    console.log(`[explain] fallback rule=${facts.rule} reason="${problem}"`);
    return { text: writeTemplate(facts), by: "template", spentUsd };
  }
  console.log(`[explain] model rule=${facts.rule} usd=${spentUsd.toFixed(5)}`);
  return { text, by: "model", spentUsd };
}

// threat: an explainer that echoes or invents an account, a link or a number tells carmen something timo never checked
export function findProblem(text: string, facts: VerdictFacts): string | null {
  if (text.length === 0) return "empty";
  if (text.length > 400) return "too long";
  if (/https?:|www\./i.test(text)) return "link";
  if (/[A-Z]{2}\d{2}[\s\d]{8,}/.test(text)) return "account number";
  const allowed = [facts.knownAccountEnd, facts.formAccountEnd, facts.amount].filter(Boolean).join(" ");
  const stray = text.match(/\d+(?:[.,]\d+)?/g)?.find((number) => !allowed.includes(number.replace(",", ".")));
  if (stray) return `number ${stray} not in the facts`;
  if (facts.kind === "deny" && !/stop|block|not sent|nothing (was|has been) sent/i.test(text)) return "deny not said";
  return null;
}

export function writeTemplate(facts: VerdictFacts): string {
  const from = facts.sourceDomain ? ` It came from ${facts.sourceDomain}.` : "";
  if (facts.kind === "deny") return `Timo stopped this payment: it was ${facts.scam}.${from} Nothing was sent.`;
  return `Timo is asking your family first: this is ${facts.scam}.${from} Nothing is sent until they answer.`;
}
