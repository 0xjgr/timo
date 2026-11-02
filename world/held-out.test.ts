import assert from "node:assert/strict";
import { get } from "node:http";
import { test } from "node:test";
import { compactIban } from "../provenance/iban.ts";
import { startWorld } from "./serve.ts";
import { ATTACKER_IBAN, GOALS, HELD_OUT } from "./scenario.ts";
import { SITES } from "./sites.ts";

// note: checks only that each held-out world serves its attack; what the rules make of it is left to the eval

type Reply = { type: string; body: Buffer };

// note: fetch drops a custom host header, and the world routes by host
function fetchFrom(world: Awaited<ReturnType<typeof startWorld>>, host: string, path: string): Promise<Reply> {
  const port = Number(world.hostRules.match(/127\.0\.0\.1:(\d+)/)![1]);
  return new Promise((resolve, reject) => {
    get({ host: "127.0.0.1", port, path, headers: { host } }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => resolve({ type: res.headers["content-type"] ?? "", body: Buffer.concat(chunks) }));
    }).on("error", reject);
  });
}

function hasAttackerIban(html: string): boolean {
  return html.replace(/\s/g, "").includes(compactIban(ATTACKER_IBAN));
}

test("every held-out scenario is an attack with a goal", () => {
  for (const scenario of HELD_OUT) assert.equal(GOALS[scenario].kind, "attack");
});

test("image mails carry the attacker iban only in the picture", async () => {
  for (const scenario of ["image-invoice", "image-notice"] as const) {
    const world = await startWorld(scenario);
    try {
      const page = await (await fetchFrom(world, SITES.mail, "/mail/0")).body.toString();
      assert.ok(page.includes('src="/mail/0/image"'), scenario);
      assert.ok(!hasAttackerIban(page), scenario);
      const image = await fetchFrom(world, SITES.mail, "/mail/0/image");
      assert.equal(image.type, "image/jpeg");
      assert.ok(image.body.byteLength > 100_000);
    } finally {
      await world.close();
    }
  }
});

test("split-iban mail never holds the whole iban in one cell", async () => {
  const world = await startWorld("split-iban");
  try {
    const page = await (await fetchFrom(world, SITES.mail, "/mail/0")).body.toString();
    const cells = [...page.matchAll(/<td>([^<]*)<\/td>/g)].map((match) => match[1]!);
    assert.ok(!cells.some(hasAttackerIban));
  } finally {
    await world.close();
  }
});

test("only portal-banner serves the attacker iban on the real portal", async () => {
  for (const scenario of ["portal-banner", "image-invoice"] as const) {
    const world = await startWorld(scenario);
    try {
      const page = await (await fetchFrom(world, SITES.portal, "/portal")).body.toString();
      assert.equal(hasAttackerIban(page), scenario === "portal-banner");
    } finally {
      await world.close();
    }
  }
});
