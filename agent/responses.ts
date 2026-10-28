const API = "https://api.meta.ai/v1";

export type ModelId = "muse-spark-1.3-contributor" | "muse-spark-1.3" | "muse-wonder-1.0";

// note: usd per 1M tokens, from dev.meta.ai pricing on oct 26
const PRICES: Record<ModelId, { input: number; cached: number; output: number }> = {
  "muse-spark-1.3-contributor": { input: 0.1, cached: 0.002, output: 0.2 },
  "muse-spark-1.3": { input: 1.25, cached: 0.15, output: 4.25 },
  "muse-wonder-1.0": { input: 4, cached: 0.2, output: 20 },
};

export type Usage = {
  input_tokens: number;
  input_tokens_details?: { cached_tokens?: number };
  output_tokens: number;
  output_tokens_details?: { reasoning_tokens?: number };
};

export type SafetyCheck = { id: string; code: string; message: string };

export type Action =
  | { type: "click"; button?: string; x: number; y: number }
  | { type: "double_click"; x: number; y: number }
  | { type: "drag"; path: { x: number; y: number }[] }
  | { type: "keypress"; keys: string[] }
  | { type: "move"; x: number; y: number }
  | { type: "scroll"; x: number; y: number; scroll_x: number; scroll_y: number }
  | { type: "type"; text: string }
  | { type: "screenshot" }
  | { type: "wait" };

export type OutputItem =
  | { type: "computer_call"; call_id: string; actions: Action[]; pending_safety_checks?: SafetyCheck[] }
  | { type: "message"; content: { type: string; text?: string }[] }
  | { type: "reasoning" }
  | { type: string };

export type Response = { id: string; status: string; output: OutputItem[]; usage: Usage };

export type Reply = { ok: true; value: Response } | { ok: false; error: string };

function readKey(): string {
  const key = process.env.META_API_KEY;
  if (!key) throw new Error("META_API_KEY missing, copy .env.example to .env");
  return key;
}

async function postJson(path: string, body: unknown): Promise<{ ok: true; value: any } | { ok: false; error: string }> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${API}${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${readKey()}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (res.ok) return { ok: true, value: JSON.parse(text) };
    // note: the api returns transient 503 "persistence service error" mid-run
    if (res.status < 500 || attempt === 3) return { ok: false, error: `http ${res.status}: ${text.slice(0, 600)}` };
    console.log(`[api] retry status=${res.status} attempt=${attempt}`);
    await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
  }
}

export function createResponse(body: Record<string, unknown>): Promise<Reply> {
  return postJson("/responses", body);
}

export async function countInputTokens(body: Record<string, unknown>): Promise<number | string> {
  const reply = await postJson("/responses/input_tokens", body);
  if (!reply.ok) return reply.error;
  return reply.value.input_tokens ?? JSON.stringify(reply.value);
}

export function priceUsage(model: ModelId, usage: Usage): number {
  const p = PRICES[model];
  const cached = usage.input_tokens_details?.cached_tokens ?? 0;
  const fresh = usage.input_tokens - cached;
  return (fresh * p.input + cached * p.cached + usage.output_tokens * p.output) / 1e6;
}
