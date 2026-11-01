import { z } from "zod";

export type Heard = { ok: true; value: { words: string; audioMs: number; spentUsd: number } } | { ok: false; error: string };

const MODEL = "muse-voice-transcribe-1.0";
const USD_PER_HOUR = 0.18;
const TIMEOUT_MS = 30_000;
// note: carmen speaks spanish; the names bias recognition toward her payees and her assistant
const SETTINGS = {
  mode: "PUSH_TO_TALK",
  model: MODEL,
  audioEncoding: "WAV",
  languageBias: ["Spanish", "English"],
  keywords: ["Timo", "Lumen", "Lumen Energy", "Banco Sol", "Jaime", "Rosa", "Lucas"],
};

const REPLY = z.object({ transcript: z.string(), audioDurationMs: z.number() });

export async function transcribeRequest(wav: Buffer): Promise<Heard> {
  const shape = checkWav(wav);
  if (shape) return { ok: false, error: shape };
  const key = process.env.META_API_KEY;
  if (!key) throw new Error("META_API_KEY missing, copy .env.example to .env");
  const form = new FormData();
  form.append("request", new Blob([JSON.stringify(SETTINGS)], { type: "application/json" }));
  form.append("audio", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "request.wav");
  const res = await fetch("https://api.meta.ai/v1/asr/transcribe", {
    method: "POST",
    headers: { authorization: `Bearer ${key}` },
    body: form,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch((error: unknown) => error instanceof Error ? error : new Error(String(error)));
  if (res instanceof Error) return { ok: false, error: res.message };
  const text = await res.text();
  if (!res.ok) return { ok: false, error: `http ${res.status}: ${text.slice(0, 300)}` };
  const reply = REPLY.safeParse(JSON.parse(text));
  if (!reply.success) return { ok: false, error: "unexpected transcribe reply" };
  const words = reply.data.transcript.trim();
  if (!words) return { ok: false, error: "nothing heard" };
  const spentUsd = (Math.floor(reply.data.audioDurationMs / 1000) / 3600) * USD_PER_HOUR;
  console.log(`[voice] heard audio_ms=${reply.data.audioDurationMs} usd=${spentUsd.toFixed(5)}`);
  return { ok: true, value: { words, audioMs: reply.data.audioDurationMs, spentUsd } };
}

// note: the endpoint takes riff/wave, mono, 16-bit pcm at 16 or 24 khz; anything else is a 400 we can name first
export function checkWav(wav: Buffer): string | null {
  if (wav.length < 44 || wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 12) !== "WAVE") return "not a wav file";
  const channels = wav.readUInt16LE(22);
  const rate = wav.readUInt32LE(24);
  const bits = wav.readUInt16LE(34);
  if (channels !== 1 || bits !== 16 || (rate !== 16_000 && rate !== 24_000)) return `wav must be mono 16-bit at 16 or 24 khz, got ${channels}ch ${bits}bit ${rate}hz`;
  return null;
}
