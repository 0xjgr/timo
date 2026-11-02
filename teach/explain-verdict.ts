import { createResponse, priceUsage, type ModelId } from "../agent/responses.ts";
import { chatSparkOpen, hasSparkOpenKey } from "../reader/spark-open.ts";
import type { VerdictFacts } from "./verdict-facts.ts";

export type Writer = "spark-open" | "spark";

export type Explanation = { text: string; by: Writer | "template"; spentUsd: number };

export type Written = { ok: true; text: string; spentUsd: number } | { ok: false; error: string; spentUsd: number };

export type Write = { by: Writer; write: (instructions: string, facts: string) => Promise<Written> };

const MODEL: ModelId = "muse-spark-1.3-contributor";

const INSTRUCTIONS = `You explain a payment decision to Carmen, who is 74 and not technical.
Talk to her directly as "you". The decision is already made by Timo and you cannot change it.
Write at most two short sentences, under 35 words in all, in plain English, using only the facts in the JSON:
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
export async function explainVerdict(facts: VerdictFacts, writer: Write = pickWriter()): Promise<Explanation> {
  const written = await writer.write(INSTRUCTIONS, JSON.stringify(facts));
  if (!written.ok) {
    console.log(`[explain] fallback rule=${facts.rule} reason="${written.error.slice(0, 80)}"`);
    return { text: writeTemplate(facts), by: "template", spentUsd: written.spentUsd };
  }
  const problem = findProblem(written.text, facts);
  if (problem) {
    console.log(`[explain] fallback rule=${facts.rule} reason="${problem}"`);
    return { text: writeTemplate(facts), by: "template", spentUsd: written.spentUsd };
  }
  console.log(`[explain] ${writer.by} rule=${facts.rule} usd=${written.spentUsd.toFixed(5)}`);
  return { text: written.text, by: writer.by, spentUsd: written.spentUsd };
}

// note: the open-weights model writes carmen's words when a baseten key is set, so what timo read about her
// household can stay on a model the family could host; without the key the hosted spark api writes them
export function pickWriter(): Write {
  return hasSparkOpenKey() ? SPARK_OPEN_WRITER : SPARK_WRITER;
}

const SPARK_OPEN_WRITER: Write = {
  by: "spark-open",
  write: async (instructions, facts) => {
    const reply = await chatSparkOpen([
      { role: "system", content: `${instructions}\nAnswer in JSON: {"text": "..."}` },
      { role: "user", content: facts },
    ], 3000);
    if (!reply.ok) return reply;
    const text = readText(reply.value.text);
    return text === undefined ? { ok: false, error: "no text field", spentUsd: reply.value.spentUsd } : { ok: true, text, spentUsd: reply.value.spentUsd };
  },
};

const SPARK_WRITER: Write = {
  by: "spark",
  write: async (instructions, facts) => {
    const reply = await createResponse({
      model: MODEL,
      instructions,
      input: [{ role: "user", content: [{ type: "input_text", text: facts }] }],
      reasoning: { effort: "low" },
      store: false,
    });
    if (!reply.ok) return { ok: false, error: reply.error, spentUsd: 0 };
    const text = reply.value.output
      .flatMap((item) => (item.type === "message" && "content" in item ? item.content : []))
      .map((part) => part.text ?? "")
      .join(" ")
      .trim();
    return { ok: true, text, spentUsd: priceUsage(MODEL, reply.value.usage) };
  },
};

function readText(json: string): string | undefined {
  // note: json mode on baseten still lets a truncated answer through
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return undefined;
  }
  return typeof parsed === "object" && parsed !== null && "text" in parsed && typeof parsed.text === "string" ? parsed.text.trim() : undefined;
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
