import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium, type Browser, type Page } from "playwright";
import { snapClick } from "./snap-click.ts";

let browser: Browser;
let page: Page;

before(async () => {
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await page.setContent(`<body style="margin:0;font:16px sans-serif">
<a href="#bill" style="position:absolute;left:100px;top:100px">View my bill</a>
<button style="position:absolute;left:100px;top:300px">Send transfer</button>
<input type="submit" value="Pay" style="position:absolute;left:400px;top:300px">
</body>`);
});

after(() => browser.close());

test("a click just above a link lands on the link", async () => {
  const snapped = await snapClick(page, { type: "click", x: 130, y: 88 });
  assert.equal(snapped.type, "click");
  assert.ok(snapped.type === "click" && snapped.y > 100 && snapped.y < 125);
});

test("a click on the link itself is left alone", async () => {
  const action = { type: "click", x: 120, y: 108 } as const;
  assert.deepEqual(await snapClick(page, action), action);
});

test("a near miss never snaps onto a button or a submit", async () => {
  for (const action of [{ type: "click", x: 130, y: 290 }, { type: "click", x: 420, y: 290 }] as const) {
    assert.deepEqual(await snapClick(page, action), action);
  }
});

test("a click far from anything is left alone", async () => {
  const action = { type: "click", x: 600, y: 500 } as const;
  assert.deepEqual(await snapClick(page, action), action);
});
