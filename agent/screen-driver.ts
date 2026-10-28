import { writeFile } from "node:fs/promises";
import type { Page } from "playwright";
import { describeAction, runAction } from "./actions.ts";
import { createResponse, priceUsage, type ModelId, type OutputItem, type SafetyCheck } from "./responses.ts";

export type ScreenOptions = {
  page: Page;
  model: ModelId;
  effort: string;
  instructions: string;
  task: string;
  maxSteps: number;
  budgetUsd: number;
  isAck: boolean;
  runDir: string;
};

// note: filled while the loop runs, so a crash still leaves what was spent and seen
export type Trail = {
  stopReason: string;
  spentUsd: number;
  safetyChecks: SafetyCheck[];
  responses: unknown[];
};

type ComputerCall = Extract<OutputItem, { type: "computer_call" }>;

async function shoot(page: Page, runDir: string, step: number): Promise<string> {
  const png = await page.screenshot({ type: "png" });
  await writeFile(`${runDir}/step-${String(step).padStart(2, "0")}.png`, png);
  return `data:image/png;base64,${png.toString("base64")}`;
}

export function startRequest(options: ScreenOptions, screenshot: string): Record<string, unknown> {
  return {
    ...baseRequest(options),
    input: [{
      role: "user",
      content: [
        { type: "input_text", text: options.task },
        { type: "input_image", image_url: screenshot },
      ],
    }],
  };
}

function baseRequest(options: ScreenOptions) {
  return {
    model: options.model,
    instructions: options.instructions,
    tools: [{ type: "computer" }],
    store: true,
    reasoning: { effort: options.effort },
  };
}

export async function firstScreenshot(options: ScreenOptions): Promise<string> {
  return shoot(options.page, options.runDir, 0);
}

export async function driveScreen(options: ScreenOptions, trail: Trail): Promise<void> {
  const { page, runDir } = options;
  let body = startRequest(options, await firstScreenshot(options));
  trail.stopReason = "step-limit";

  for (let step = 1; step <= options.maxSteps; step++) {
    const reply = await createResponse(body);
    if (!reply.ok) {
      trail.stopReason = `api-error ${reply.error}`;
      return;
    }
    const response = reply.value;
    trail.responses.push(response);
    const cost = priceUsage(options.model, response.usage);
    trail.spentUsd += cost;
    const u = response.usage;
    console.log(`[spend] step=${step} in=${u.input_tokens} cached=${u.input_tokens_details?.cached_tokens ?? 0} out=${u.output_tokens} usd=${cost.toFixed(4)} total=${trail.spentUsd.toFixed(4)}`);

    for (const item of response.output) {
      if (item.type === "message" && "content" in item) {
        for (const part of item.content) if (part.text) console.log(`[agent] says: ${part.text}`);
      }
    }

    const calls = response.output.filter((item): item is ComputerCall => item.type === "computer_call");
    if (calls.length === 0) {
      trail.stopReason = "agent-finished";
      return;
    }

    const outputs = [];
    for (const call of calls) {
      const checks = call.pending_safety_checks ?? [];
      for (const check of checks) console.log(`[meta] safety_check code=${check.code} message="${check.message}"`);
      trail.safetyChecks.push(...checks);
      // note: the generic confirmation fires on harmless clicks, so it is counted, not obeyed
      const isAlarming = checks.some((check) => check.code !== "computer_action_requires_confirmation");
      if (isAlarming && !options.isAck) {
        trail.stopReason = "meta-safety-check";
        return;
      }
      for (const action of call.actions) {
        console.log(`[agent] step=${step} ${describeAction(action)}`);
        await runAction(page, action);
      }
      await page.waitForLoadState("load");
      outputs.push({
        type: "computer_call_output",
        call_id: call.call_id,
        acknowledged_safety_checks: checks,
        output: { type: "computer_screenshot", image_url: await shoot(page, runDir, step) },
      });
    }
    // threat: runaway loop draining hackathon credits
    if (trail.spentUsd > options.budgetUsd) {
      trail.stopReason = `budget ${options.budgetUsd} usd`;
      return;
    }
    body = { ...baseRequest(options), previous_response_id: response.id, input: outputs };
  }
}
