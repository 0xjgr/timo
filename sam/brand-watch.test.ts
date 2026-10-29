import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium, type Browser, type Page } from "playwright";
import { HOUSEHOLD_LEDGER } from "../ledger/household.ts";
import { startWorld, type World } from "../world/serve.ts";
import { siteUrl } from "../world/sites.ts";
import { matchLogos } from "./brand-watch.ts";
import type { Region } from "./segment.ts";

let world: World;
let browser: Browser;

before(async () => {
  world = await startWorld("clone");
  browser = await chromium.launch({ args: [`--host-resolver-rules=${world.hostRules}`] });
});

after(async () => {
  await browser.close();
  await world.close();
});

// note: stands in for sam, which boxes the round mark at x 10-54 of the 220x64 logo
async function boxMark(page: Page): Promise<Region> {
  const rect = await page.locator(".brand img").boundingBox();
  assert.ok(rect);
  const scale = rect.width / 220;
  return {
    left: Math.round(rect.x + 10 * scale),
    top: Math.round(rect.y + 10 * scale),
    right: Math.round(rect.x + 54 * scale),
    bottom: Math.round(rect.y + 54 * scale),
  };
}

async function shoot(url: string): Promise<{ png: Buffer; mark: Region }> {
  const page = await browser.newPage({ viewport: { width: 1024, height: 720 } });
  await page.goto(url);
  const mark = await boxMark(page);
  const png = await page.screenshot();
  await page.close();
  return { png, mark };
}

test("the cloned portal's logo matches lumen's ledger logo at another size", async () => {
  const { png, mark } = await shoot(siteUrl("clone", "/portal"));
  const match = matchLogos(png, [mark], HOUSEHOLD_LEDGER);
  assert.equal(match?.payeeId, "lumen");
});

test("a region with no logo matches nothing", async () => {
  const { png } = await shoot(siteUrl("clone", "/portal"));
  const text = { left: 30, top: 480, right: 200, bottom: 520 };
  assert.equal(matchLogos(png, [text], HOUSEHOLD_LEDGER), undefined);
});
