import { randomBytes, timingSafeEqual } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { networkInterfaces } from "node:os";
import { z } from "zod";
import type { Blocked } from "../gate/gates.ts";
import { isDecision, listVerdicts, verifyChain, type GuardianAnswer } from "../gate/verdict-log.ts";
import type { Payee } from "../ledger/payee.ts";
import { buildAskView, type AskView } from "./ask-view.ts";
import { renderDesk } from "./render-desk.ts";

export type Desk = { url: string; ask: (block: Blocked) => Promise<GuardianAnswer>; close: () => Promise<void> };

type DeskOptions = { runDir: string; ledger: Payee[]; host?: string; port?: number; timeoutMs?: number };

const COOKIE = "timo_desk";
const MAX_BODY = 4096;
const SESSION = z.object({ token: z.string().max(200) });
const ANSWER = z.object({ seq: z.number().int().nonnegative(), isApproved: z.boolean() });
// threat: path traversal out of the run folder; only lens and teach files by exact shape
const EVIDENCE = /^\/evidence\/((?:lens|teach)\/[a-z0-9-]+\.(html|png))$/;
const TYPES: Record<string, string> = { html: "text/html; charset=utf-8", png: "image/png" };

// threat: anyone on the network could approve a payment, so the desk wants the token from the
// link it printed; the token rides in the url fragment, which never reaches a server log or a referer
export async function openDesk(options: DeskOptions): Promise<Desk> {
  const { runDir, ledger, host = "127.0.0.1", port = 4300, timeoutMs = 10 * 60_000 } = options;
  const token = randomBytes(18).toString("base64url");
  const session = randomBytes(18).toString("base64url");
  const pending = new Map<number, { view: AskView; settle: (answer: GuardianAnswer) => void }>();

  const readState = async () => {
    const text = await readFile(`${runDir}/verdicts.jsonl`, "utf8").catch(() => "");
    const checked = verifyChain(text);
    if (!checked.ok) return { pending: [...pending.values()].map((ask) => ask.view), chain: { ok: false, line: checked.error.line }, log: [] };
    const answers = new Map(checked.value.filter(isDecision).map((entry) => [entry.decision.forSeq, entry.decision]));
    const log = listVerdicts(checked.value).map((entry) => ({
      seq: entry.seq,
      at: entry.at,
      kind: entry.verdict.kind,
      rule: entry.verdict.kind === "allow" ? null : entry.verdict.rule,
      target: entry.commit.targetDomain,
      answer: answers.get(entry.seq) ?? null,
    }));
    return { pending: [...pending.values()].map((ask) => ask.view), chain: { ok: true, head: checked.value.at(-1)?.hash.slice(0, 12) ?? "empty" }, log };
  };

  const server = createServer((req, res) => {
    route(req, res).catch((error: unknown) => {
      console.log(`[desk] error path=${req.url} reason="${error instanceof Error ? error.message : String(error)}"`);
      if (!res.headersSent) sendJson(res, 500, { error: "internal" });
    });
  });

  const route = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const path = new URL(req.url ?? "/", "http://desk").pathname;
    if (req.method === "GET" && path === "/") {
      const nonce = randomBytes(12).toString("base64");
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src 'self'; connect-src 'self'; frame-src 'self'; frame-ancestors 'none'`,
        "cache-control": "no-store",
      });
      return void res.end(renderDesk(nonce));
    }
    if (req.method === "POST" && path === "/api/session") {
      const body = SESSION.safeParse(await readJson(req));
      if (!body.success || !isSame(body.data.token, token)) return sendJson(res, 403, { error: "wrong link" });
      res.setHeader("set-cookie", `${COOKIE}=${session}; HttpOnly; SameSite=Strict; Path=/`);
      return sendJson(res, 200, { ok: true });
    }
    // threat: samesite=strict keeps another site from posting an approval with the guardian's cookie
    if (!isSame(readCookie(req) ?? "", session)) return sendJson(res, 401, { error: "open the link Timo printed" });
    if (req.method === "GET" && path === "/api/state") return sendJson(res, 200, await readState());
    if (req.method === "POST" && path === "/api/answer") {
      const body = ANSWER.safeParse(await readJson(req));
      if (!body.success) return sendJson(res, 400, { error: "bad answer" });
      const ask = pending.get(body.data.seq);
      if (!ask) return sendJson(res, 409, { error: "nothing waiting for that" });
      ask.settle({ isApproved: body.data.isApproved, by: "guardian" });
      return sendJson(res, 200, { ok: true });
    }
    const evidence = req.method === "GET" ? path.match(EVIDENCE) : null;
    if (evidence) {
      const bytes = await readFile(`${runDir}/${evidence[1]}`).catch(() => undefined);
      if (!bytes) return sendJson(res, 404, { error: "no such evidence" });
      res.writeHead(200, { "content-type": TYPES[evidence[2]!]!, "content-security-policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'", "cache-control": "no-store" });
      return void res.end(bytes);
    }
    sendJson(res, 404, { error: "not found" });
  };

  await new Promise<void>((resolve) => server.listen(port, host, resolve));
  const shownHost = host === "0.0.0.0" ? findLanAddress() : host;
  const url = `http://${shownHost}:${(server.address() as AddressInfo).port}/#t=${token}`;

  const ask = async (block: Blocked): Promise<GuardianAnswer> => {
    const lens = `lens/verdict-${block.seq}.html`;
    const lensHref = await access(`${runDir}/${lens}`).then(() => `/evidence/${lens}`, () => undefined);
    const view = buildAskView(block, ledger, timeoutMs, lensHref);
    console.log(`[desk] ask seq=${block.seq} rule=${block.verdict.rule} waiting_s=${timeoutMs / 1000}`);
    return new Promise((resolve) => {
      // note: silence is a no; the commit stays held and the agent hears it was declined
      const timer = setTimeout(() => settle({ isApproved: false, by: "timeout" }), timeoutMs);
      const settle = (answer: GuardianAnswer) => {
        clearTimeout(timer);
        pending.delete(block.seq);
        resolve(answer);
      };
      pending.set(block.seq, { view, settle });
    });
  };

  const close = () =>
    new Promise<void>((resolve) => {
      for (const waiting of pending.values()) waiting.settle({ isApproved: false, by: "timeout" });
      server.closeAllConnections();
      server.close(() => resolve());
    });

  return { url, ask, close };
}

function isSame(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function readCookie(req: IncomingMessage): string | undefined {
  return (req.headers.cookie ?? "").split(";").map((part) => part.trim().split("=")).find(([name]) => name === COOKIE)?.[1];
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > MAX_BODY) return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

function findLanAddress(): string {
  const addresses = Object.values(networkInterfaces()).flat();
  return addresses.find((address) => address?.family === "IPv4" && !address.internal)?.address ?? "127.0.0.1";
}
