import { writeFile } from "node:fs/promises";

// note: muse image drew timo once (1600px); the committed carmen/timo.png is that drawing
// cropped to 256px for the phone, docs/timo.png the same at 512px
const PROMPT =
  "A sturdy old watchdog, a calm mixed-breed dog with floppy ears, sitting upright and alert, wearing small round " +
  "reading glasses, one paw resting on a closed envelope as if checking it before letting it through. Flat vector " +
  "mascot illustration, simple bold shapes, thick rounded outlines, only two colors: deep forest green #1e6b3c and " +
  "warm cream #f7f5f0, plus a little off-black for eyes. Plain cream background, centered, full body, friendly and " +
  "calm, trustworthy, no text, no letters, no logos.";

const key = process.env.META_API_KEY;
if (!key) throw new Error("META_API_KEY missing, copy .env.example to .env");
const response = await fetch("https://api.meta.ai/v1/images/generations", {
  method: "POST",
  headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
  body: JSON.stringify({
    model: "muse-image-1.0",
    prompt: PROMPT,
    n: 1,
    size: "1024x1024",
    output_format: "png",
    tool_enablement: { enable_image_search: false, enable_web_search: false },
  }),
});
if (!response.ok) throw new Error(`muse image ${response.status}: ${(await response.text()).slice(0, 300)}`);
const body = (await response.json()) as { data: { b64_json: string }[] };
await writeFile("timo-drawing.png", Buffer.from(body.data[0]!.b64_json, "base64"));
console.log("[draw] timo wrote timo-drawing.png usd=0.01");
