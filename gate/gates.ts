import type { Page, Request, Route } from "playwright";
import type { Payee } from "../ledger/payee.ts";
import type { BrandWatch } from "../sam/brand-watch.ts";
import { judgeCommit } from "../policy/judge.ts";
import type { Verdict } from "../policy/verdict.ts";
import { registrableDomain } from "../provenance/domain.ts";
import { extractIbans } from "../provenance/iban.ts";
import type { Lens } from "../lens/lens.ts";
import type { ReaderWatch } from "../reader/reader-watch.ts";
import { recordPage, type SourceHook } from "../provenance/page-reader.ts";
import type { SourceLog } from "../provenance/source-log.ts";
import type { BillCheck, Sent, Trace } from "../provenance/trace.ts";
import type { Commit } from "./commit.ts";
import { checkBill } from "./check-bill.ts";
import { readPendingForm, type FormField } from "./pending-form.ts";
import { traceFields } from "./sensitive-fields.ts";
import type { FollowUp, GuardianAnswer, VerdictLog } from "./verdict-log.ts";

export type Trigger = { kind: "click"; x: number; y: number } | { kind: "enter" } | { kind: "space" };

// note: seq points at the verdict log entry, so the guardian's answer can name what it answers
export type Blocked = { via: Commit["via"]; verdict: Exclude<Verdict, { kind: "allow" }>; seq: number; commit: Commit };

export type Gates = {
  checkTrigger: (trigger: Trigger) => Promise<Blocked | null>;
  // note: network blocks happen outside the agent's turn, so the driver waits for them after each action
  takeNetworkBlocks: () => Promise<Blocked[]>;
  // note: the answer is chained into the verdict log; a yes lets that exact held submit leave once
  answerHeld: (block: Blocked, answer: GuardianAnswer) => Promise<void>;
};

const QUIET_MS = 250;

type GateContext = {
  page: Page;
  sources: SourceLog;
  ledger: Payee[];
  verdicts: VerdictLog;
  mailHost: string;
  brands?: BrandWatch;
  reader?: ReaderWatch;
  onRecord?: SourceHook;
  lens?: Lens;
};

export async function openGates(context: GateContext): Promise<Gates> {
  const { page, sources, mailHost } = context;
  const cleared: FormField[][] = [];
  let held: { seq: number; fields: FormField[] } | undefined;
  const networkBlocks: Blocked[] = [];
  const inFlight = new Set<Promise<void>>();
  // note: one look per payee and errand; the bill does not change while the agent works
  const bills = new Map<string, Promise<BillCheck | undefined>>();
  const sent: Sent[] = [];

  const judge = async (commit: Commit, fields: FormField[]): Promise<{ verdict: Verdict; seq: number }> => {
    if (context.brands) {
      await context.brands.settle();
      commit.impostors = context.brands.listImpostors();
    }
    if (context.reader) {
      await context.reader.settle();
      const sourceIds = new Set(commit.values.flatMap((trace) => trace.origins).flatMap((origin) => (origin.kind === "foreign" ? [origin.sourceId] : [])));
      commit.flags = context.reader.listFlags().filter((flag) => sourceIds.has(flag.sourceId));
    }
    const paid = context.ledger.filter((payee) => commit.values.some((trace) => trace.kind === "iban" && trace.value === payee.iban));
    for (const payee of paid) if (!bills.has(payee.id)) bills.set(payee.id, checkBill(page, payee));
    commit.checked = (await Promise.all(paid.map((payee) => bills.get(payee.id)!))).filter((check) => check !== undefined);
    const verdict = judgeCommit(commit, context.ledger);
    const entry = await context.verdicts.append(commit, verdict, chooseFollowUp(verdict));
    console.log(`[gate] ${describeVerdict(verdict)} via=${commit.via} target=${commit.targetDomain} ${describeTraces(commit.values)}`);
    // note: the lens is evidence for people, so a failed capture is logged and the verdict stands
    await context.lens?.record(entry, page, fields).catch((error: unknown) => {
      console.log(`[lens] failed seq=${entry.seq} reason="${error instanceof Error ? error.message.split("\n")[0] : String(error)}"`);
    });
    return { verdict, seq: entry.seq };
  };

  const checkTrigger = async (trigger: Trigger): Promise<Blocked | null> => {
    const form = await readPendingForm(page, trigger);
    if (!form) return null;
    // note: re-read the page first, a script may have changed its text after the load event
    await recordPage(page, sources, mailHost, context.onRecord);
    const values = traceFields(form.fields, sources);
    if (values.length === 0) return null;
    const commit: Commit = {
      via: "click",
      hasPassedClickGate: true,
      pageUrl: page.url(),
      pageDomain: registrableDomain(page.url()),
      targetDomain: registrableDomain(form.action),
      values,
      flags: [],
      impostors: [],
      stated: sources.listStatements(),
      checked: [],
      sent: [...sent],
    };
    const { verdict, seq } = await judge(commit, form.fields);
    if (verdict.kind === "allow") {
      cleared.push(form.fields);
      return null;
    }
    held = verdict.kind === "ask" ? { seq, fields: form.fields } : undefined;
    return { via: "click", verdict, seq, commit };
  };

  // threat: a page script that posts payment details without a click, or swaps them after the click passed
  await page.route("**/*", (route: Route, request: Request) => {
    if (!["POST", "PUT", "PATCH"].includes(request.method())) return route.continue();
    const judged = judgeRequest(route, request).finally(() => inFlight.delete(judged));
    inFlight.add(judged);
    return judged;
  });

  const judgeRequest = async (route: Route, request: Request): Promise<void> => {
    const fields = readBody(request);
    const values = traceFields(fields, sources);
    const match = cleared.findIndex((checked) => isSameSubmit(checked, fields));
    if (match !== -1) {
      cleared.splice(match, 1);
      recordSent(sent, values);
      return route.continue();
    }
    if (values.length === 0) return route.continue();
    const commit: Commit = {
      via: "network",
      hasPassedClickGate: false,
      pageUrl: request.frame().url(),
      pageDomain: registrableDomain(request.frame().url()),
      targetDomain: registrableDomain(request.url()),
      values,
      flags: [],
      impostors: [],
      stated: sources.listStatements(),
      checked: [],
      sent: [...sent],
    };
    const { verdict, seq } = await judge(commit, fields);
    if (verdict.kind === "allow") {
      recordSent(sent, values);
      return route.continue();
    }
    networkBlocks.push({ via: "network", verdict, seq, commit });
    return route.abort("blockedbyclient");
  };

  // note: a click or a script submit reaches the route a moment later, so wait for a quiet window
  const takeNetworkBlocks = async (): Promise<Blocked[]> => {
    do {
      await page.waitForTimeout(QUIET_MS);
      await Promise.all(inFlight);
    } while (inFlight.size > 0);
    return networkBlocks.splice(0);
  };

  const answerHeld = async (block: Blocked, answer: GuardianAnswer): Promise<void> => {
    await context.verdicts.appendDecision(block.seq, answer);
    console.log(`[guardian] ${answer.isApproved ? "approve" : "decline"} seq=${block.seq} by=${answer.by} rule=${block.verdict.rule}`);
    // threat: a late yes for an older ask must not release whatever submit is held now
    if (answer.isApproved && held?.seq === block.seq) cleared.push(held.fields);
    held = undefined;
  };

  return { checkTrigger, takeNetworkBlocks, answerHeld };
}

function recordSent(sent: Sent[], values: Trace[]): void {
  const amount = values.find((trace) => trace.kind === "amount")?.value;
  for (const trace of values) if (trace.kind === "iban") sent.push({ iban: trace.value, amount });
}

function readBody(request: Request): FormField[] {
  const body = request.postData() ?? "";
  const type = request.headers()["content-type"] ?? "";
  const field = (name: string, value: unknown): FormField => ({ name, label: "", type: "text", value: String(value) });
  if (type.includes("application/x-www-form-urlencoded")) return [...new URLSearchParams(body)].map(([name, value]) => field(name, value));
  if (type.includes("application/json")) {
    const parsed = parseJson(body);
    if (parsed && typeof parsed === "object") return Object.entries(parsed).map(([name, value]) => field(name, value));
  }
  // todo: multipart bodies are read as one blob, enough to find an iban but not a labeled amount
  return body === "" ? [] : [field("body", body)];
}

// note: the body is page content, so malformed json is expected and falls back to the blob
function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

// threat: the click passed with one iban and a submit handler swapped it before the post left
function isSameSubmit(checked: FormField[], sent: FormField[]): boolean {
  const sentByName = new Map(sent.map((field) => [field.name, field.value]));
  const isEveryCheckedSent = checked.every((field) => field.name === "" || sentByName.get(field.name) === field.value);
  const checkedIbans = new Set(checked.flatMap((field) => extractIbans(field.value)));
  const isEveryIbanChecked = sent.flatMap((field) => extractIbans(field.value)).every((iban) => checkedIbans.has(iban));
  return isEveryCheckedSent && isEveryIbanChecked;
}

function chooseFollowUp(verdict: Verdict): FollowUp {
  if (verdict.kind === "allow") return "none";
  if (verdict.kind === "ask") return "guardian-ask";
  return verdict.rule === "payee-drift" || verdict.rule === "brand-impostor" ? "teach-card" : "guardian-notice";
}

function describeVerdict(verdict: Verdict): string {
  return verdict.kind === "allow" ? "allow" : `${verdict.kind} rule=${verdict.rule}`;
}

function describeTraces(traces: Trace[]): string {
  return traces
    .map((trace) => {
      const origins = trace.origins.map((origin) => (origin.kind === "foreign" ? `${origin.via}:${origin.domain}` : origin.kind));
      return `${trace.kind}=${trace.value} origin=${origins.join("+") || "none"}`;
    })
    .join(" ");
}
