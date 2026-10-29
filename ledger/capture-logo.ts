import { chromium } from "playwright";
import { decodePng, hashRegion } from "../sam/logo-hash.ts";
import { segmentImage } from "../sam/segment.ts";
import { startWorld } from "../world/serve.ts";
import { siteUrl } from "../world/sites.ts";

// note: when the guardian confirms a payee, timo takes the logo from the payee's own site.
// usage: npm run capture-logo, then paste the hash into ledger/household.ts
const world = await startWorld("legit");
const browser = await chromium.launch({ args: [`--host-resolver-rules=${world.hostRules}`] });
try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 720 } });
  await page.goto(siteUrl("portal", "/portal"));
  const png = await page.screenshot();
  const segmentation = await segmentImage(png, "logo");
  if (!segmentation.ok) throw new Error(segmentation.error);
  const [region] = segmentation.value;
  if (!region) throw new Error("no logo found on the payee's site");
  console.log(`[ledger] logo payee=lumen hash=${hashRegion(decodePng(png), region)} box=${region.left},${region.top},${region.right},${region.bottom}`);
} finally {
  await browser.close();
  await world.close();
}
