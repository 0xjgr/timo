const API = "https://inference.baseten.co/v1";

export const SPARK_OPEN = "meta-models/muse-spark-open-1026";

// note: usd per 1M tokens on baseten model apis, checked oct 27
const PRICE = { input: 1.25, output: 4.25 };

const REQUEST_TIMEOUT_MS = 45_000;

export type ChatMessage = { role: "system" | "user"; content: string };

export type ChatReply = { ok: true; value: { text: string; spentUsd: number } } | { ok: false; error: string; spentUsd: number };

export type Chat = (messages: ChatMessage[], maxTokens: number) => Promise<ChatReply>;

export function hasSparkOpenKey(): boolean {
  return Boolean(process.env.BASETEN_API_KEY);
}

// note: spark open reasons before it answers; low effort keeps the reasoning inside max_tokens
export const chatSparkOpen: Chat = async (messages, maxTokens) => {
  for (let attempt = 1; ; attempt++) {
    const sent = await sendOnce({ model: SPARK_OPEN, messages, max_tokens: maxTokens, reasoning_effort: "low", response_format: { type: "json_object" } });
    if (sent.ok && sent.status < 400) return readReply(sent.text);
    const error = sent.ok ? `http ${sent.status}: ${sent.text.slice(0, 300)}` : sent.error;
    if ((sent.ok && sent.status < 500 && sent.status !== 429) || attempt === 3) return { ok: false, error, spentUsd: 0 };
    console.log(`[baseten] retry reason="${error.slice(0, 80)}" attempt=${attempt}`);
    await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
  }
};

function readReply(text: string): ChatReply {
  const body = JSON.parse(text) as {
    choices?: { message?: { content?: string | null }; finish_reason?: string }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const spentUsd = ((body.usage?.prompt_tokens ?? 0) * PRICE.input + (body.usage?.completion_tokens ?? 0) * PRICE.output) / 1e6;
  const choice = body.choices?.[0];
  const content = choice?.message?.content;
  if (!content) return { ok: false, error: `no content finish=${choice?.finish_reason ?? "none"}`, spentUsd };
  return { ok: true, value: { text: content, spentUsd } };
}

async function sendOnce(body: unknown): Promise<{ ok: true; status: number; text: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${API}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.BASETEN_API_KEY ?? ""}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return { ok: true, status: res.status, text: await res.text() };
  } catch (error) {
    // note: fetch throws for timeouts and dropped connections
    return { ok: false, error: `network ${error instanceof Error ? error.name : "error"}: ${error instanceof Error ? error.message : String(error)}` };
  }
}
