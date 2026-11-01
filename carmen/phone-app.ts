import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { z } from "zod";
import type { Heard } from "../voice/transcribe.ts";
import { renderPhone } from "./render-phone.ts";

export type PhoneStage =
  | { kind: "listen" }
  | { kind: "heard"; words: string }
  | { kind: "working"; words: string }
  | { kind: "asking"; words: string }
  | { kind: "done"; words: string; said: string; tone: "ok" | "stop" | "unsure"; hasCard: boolean };

export type PhoneApp = {
  url: string;
  waitForWords: () => Promise<string>;
  showWorking: () => void;
  showAsking: () => void;
  showDone: (said: string, tone: "ok" | "stop" | "unsure", cardFile?: string) => void;
  readSpentUsd: () => number;
  close: () => Promise<void>;
};

type PhoneOptions = { host?: string; port?: number; hear: (wav: Buffer) => Promise<Heard> };

const COOKIE = "timo_phone";
// note: 30 s of 24 khz 16-bit mono is 1.4 mb; the page stops recording at 30 s
const MAX_AUDIO = 2 * 1024 * 1024;
const MAX_JSON = 4096;
const SESSION = z.object({ token: z.string().max(200) });
const CONFIRM = z.object({ isConfirmed: z.boolean() });
const TYPED = z.object({ words: z.string().trim().min(3).max(400) });

// threat: whoever reaches the app speaks for carmen, and her words are the trusted origin, so the
// app wants the token from the printed link like the guardian desk does
export async function openPhone(options: PhoneOptions): Promise<PhoneApp> {
  const { host = "127.0.0.1", port = 4400, hear } = options;
  const token = randomBytes(18).toString("base64url");
  const session = randomBytes(18).toString("base64url");
  let stage: PhoneStage = { kind: "listen" };
  let cardFile: string | undefined;
  let spentUsd = 0;
  let isHearing = false;
  let confirmWords: ((words: string) => void) | undefined;
  const confirmed = new Promise<string>((resolve) => (confirmWords = resolve));

  const server = createServer((req, res) => {
    route(req, res).catch((error: unknown) => {
      console.log(`[phone] error path=${req.url} reason="${error instanceof Error ? error.message : String(error)}"`);
      if (!res.headersSent) sendJson(res, 500, { error: "internal" });
    });
  });

  const route = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const path = new URL(req.url ?? "/", "http://phone").pathname;
    if (req.method === "GET" && path === "/") {
      const nonce = randomBytes(12).toString("base64");
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'self'; frame-src 'self'; frame-ancestors 'none'`,
        "permissions-policy": "microphone=(self)",
        "cache-control": "no-store",
      });
      return void res.end(renderPhone(nonce));
    }
    if (req.method === "POST" && path === "/api/session") {
      const body = SESSION.safeParse(await readJson(req));
      if (!body.success || !isSame(body.data.token, token)) return sendJson(res, 403, { error: "wrong link" });
      res.setHeader("set-cookie", `${COOKIE}=${session}; HttpOnly; SameSite=Strict; Path=/`);
      return sendJson(res, 200, { ok: true });
    }
    if (!isSame(readCookie(req) ?? "", session)) return sendJson(res, 401, { error: "open the link Timo printed" });
    if (req.method === "GET" && path === "/api/state") return sendJson(res, 200, stage);
    if (req.method === "POST" && path === "/api/voice") {
      if (stage.kind !== "listen" || isHearing) return sendJson(res, 409, { error: "not listening" });
      const wav = await readBody(req, MAX_AUDIO);
      if (!wav) return sendJson(res, 413, { error: "too long, say it in under 30 seconds" });
      isHearing = true;
      const heard = await hear(wav).finally(() => (isHearing = false));
      if (!heard.ok) {
        console.log(`[phone] not heard reason="${heard.error.slice(0, 120)}"`);
        return sendJson(res, 422, { error: "Timo did not catch that. Please try again." });
      }
      spentUsd += heard.value.spentUsd;
      stage = { kind: "heard", words: heard.value.words };
      console.log(`[phone] heard words="${heard.value.words.slice(0, 160)}"`);
      return sendJson(res, 200, stage);
    }
    if (req.method === "POST" && path === "/api/typed") {
      const body = TYPED.safeParse(await readJson(req));
      if (!body.success || stage.kind !== "listen") return sendJson(res, 400, { error: "type what Timo should do" });
      stage = { kind: "heard", words: body.data.words };
      return sendJson(res, 200, stage);
    }
    if (req.method === "POST" && path === "/api/confirm") {
      const body = CONFIRM.safeParse(await readJson(req));
      if (!body.success || stage.kind !== "heard") return sendJson(res, 409, { error: "nothing to confirm" });
      // note: carmen hears back what timo understood before anything starts; a no means say it again
      if (!body.data.isConfirmed) stage = { kind: "listen" };
      else {
        stage = { kind: "working", words: stage.words };
        confirmWords?.(stage.words);
      }
      return sendJson(res, 200, stage);
    }
    if (req.method === "GET" && path === "/card" && cardFile) {
      const card = await readFile(cardFile);
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'", "cache-control": "no-store" });
      return void res.end(card);
    }
    sendJson(res, 404, { error: "not found" });
  };

  await new Promise<void>((resolve) => server.listen(port, host, resolve));
  const shownHost = host === "0.0.0.0" ? "localhost" : host;
  const url = `http://${shownHost}:${(server.address() as AddressInfo).port}/#t=${token}`;
  const wordsNow = () => (stage.kind === "listen" ? "" : stage.words);

  return {
    url,
    waitForWords: () => confirmed,
    showWorking: () => void (stage = { kind: "working", words: wordsNow() }),
    showAsking: () => void (stage = { kind: "asking", words: wordsNow() }),
    showDone: (said, tone, file) => {
      cardFile = file;
      stage = { kind: "done", words: wordsNow(), said, tone, hasCard: Boolean(file) };
    },
    readSpentUsd: () => spentUsd,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

function isSame(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function readCookie(req: IncomingMessage): string | undefined {
  return (req.headers.cookie ?? "").split(";").map((part) => part.trim().split("=")).find(([name]) => name === COOKIE)?.[1];
}

async function readBody(req: IncomingMessage, limit: number): Promise<Buffer | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > limit) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const raw = await readBody(req, MAX_JSON);
  try {
    return raw ? JSON.parse(raw.toString()) : null;
  } catch {
    return null;
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}
