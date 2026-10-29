import { decodeMaskToSVGPath } from "@meta-sam/parser";
import type { VerdictEntry } from "../gate/verdict-log.ts";
import type { Source } from "../provenance/source-log.ts";
import type { Origin, Trace } from "../provenance/trace.ts";
import type { Mark, Rect } from "./snapshots.ts";

type Image = { file: string; width: number; height: number };

export type LensPage = {
  entry: VerdictEntry;
  commitImage?: Image;
  fields: { trace: Trace; rect?: Rect; isVouched: boolean }[];
  sources: { source: Source; image: Image; marks: Mark[] }[];
};

const STYLE = `
:root { --bg: #111312; --panel: #1a1d1b; --line: #2c312e; --text: #e6e8e3; --dim: #8d948f;
  --deny: #ff5a4e; --ask: #f2b705; --ok: #4cc38a; --foreign: #ff5a4e; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.5 "DejaVu Sans", system-ui, sans-serif; }
main { max-width: 1100px; margin: 0 auto; padding: 24px 16px 48px; }
code, .mono, td, .chip { font-family: "DejaVu Sans Mono", ui-monospace, monospace; }
header { border-bottom: 1px solid var(--line); padding-bottom: 14px; }
.verdict { display: inline-block; padding: 2px 10px; font-weight: bold; letter-spacing: .06em; }
.deny { background: var(--deny); color: #111; } .ask { background: var(--ask); color: #111; }
h1 { font-size: 20px; margin: 10px 0 4px; } h2 { font-size: 15px; color: var(--dim); text-transform: uppercase; letter-spacing: .08em; margin: 30px 0 10px; }
.meta { color: var(--dim); font-size: 13px; }
table { border-collapse: collapse; width: 100%; font-size: 14px; }
td, th { text-align: left; padding: 6px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { color: var(--dim); font-weight: normal; }
.trusted { color: var(--ok); } .foreign { color: var(--foreign); }
figure { margin: 0; background: var(--panel); border: 1px solid var(--line); padding: 10px; }
figcaption { color: var(--dim); font-size: 13px; margin-bottom: 8px; overflow-wrap: anywhere; }
.shot { position: relative; }
.shot img, .shot svg { display: block; width: 100%; height: auto; }
.shot svg { position: absolute; inset: 0; height: 100%; }
.box { position: absolute; border: 2px solid; }
.box.trusted { border-color: var(--ok); } .box.foreign { border-color: var(--foreign); background: rgba(255,90,78,.12); }
.chip { position: absolute; transform: translateY(-100%); font-size: 11px; padding: 1px 6px; white-space: nowrap; color: #111; }
.chip.trusted { background: var(--ok); } .chip.foreign { background: var(--foreign); }
.sources { display: grid; gap: 16px; }
`;

export function renderLens(page: LensPage): string {
  const { entry } = page;
  if (entry.verdict.kind === "allow") throw new Error("the lens only explains ask and deny verdicts");
  const kind = entry.verdict.kind;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Timo verdict ${entry.seq}</title><style>${STYLE}</style></head><body><main>
<header><span class="verdict ${kind}">${kind.toUpperCase()}</span> <code>${entry.verdict.rule}</code>
<h1>${escapeHtml(entry.verdict.reason)}</h1>
<div class="meta mono">verdict ${entry.seq} · ${entry.at} · rules ${entry.rulesCommit} · via ${entry.commit.via} gate · to ${entry.commit.targetDomain} · hash ${entry.hash.slice(0, 12)}</div></header>
<h2>What the form was about to send</h2>
<table><tr><th>Value</th><th></th><th>Where it came from</th></tr>
${page.fields.map(({ trace, isVouched }) => `<tr><td>${trace.kind}</td><td>${escapeHtml(trace.value)}</td><td class="${isVouched ? "trusted" : "foreign"}">${describeOrigins(trace.origins)}</td></tr>`).join("\n")}
</table>
${page.commitImage ? `<h2>At the moment of the click</h2>
<figure><figcaption>${escapeHtml(entry.commit.pageUrl)}</figcaption>
${renderShot(page.commitImage, page.fields.flatMap(({ trace, rect, isVouched }) => (rect ? [{ rect, label: `${trace.kind}: ${shortOrigins(trace.origins)}`, isTrusted: isVouched }] : [])))}
</figure>` : `<p class="meta">Held at the network on ${escapeHtml(entry.commit.pageUrl)}, while the page was sending it, so there is no screenshot of the form.</p>`}
<h2>Where the untrusted values were read</h2>
<div class="sources">
${page.sources.map(({ source, image, marks }) => `<figure><figcaption>${source.via} from ${escapeHtml(source.domain)} · ${escapeHtml(source.id)}</figcaption>
${renderShot(image, marks.map((mark) => ({ rect: mark.rect, label: mark.text, isTrusted: false, mask: mark.mask })))}</figure>`).join("\n")}
</div>
</main></body></html>`;
}

type Overlay = { rect: Rect; label: string; isTrusted: boolean; mask?: Mark["mask"] };

function renderShot(image: Image, overlays: Overlay[]): string {
  const pct = (value: number, whole: number) => `${((value / whole) * 100).toFixed(3)}%`;
  const masks = overlays.flatMap((overlay) => {
    if (!overlay.mask) return [];
    const scaleX = overlay.rect.width / overlay.mask.width;
    const scaleY = overlay.rect.height / overlay.mask.height;
    return [`<path d="${decodeMaskToSVGPath(overlay.mask)}" transform="translate(${overlay.rect.x} ${overlay.rect.y}) scale(${scaleX} ${scaleY})" fill="rgba(255,90,78,.45)" stroke="#ff5a4e" stroke-width="1"/>`];
  });
  const boxes = overlays.map((overlay) => {
    const tone = overlay.isTrusted ? "trusted" : "foreign";
    const left = pct(overlay.rect.x, image.width);
    const top = pct(overlay.rect.y, image.height);
    return `<div class="box ${tone}" style="left:${left};top:${top};width:${pct(overlay.rect.width, image.width)};height:${pct(overlay.rect.height, image.height)}"></div>
<div class="chip ${tone}" style="left:${left};top:${top}">${escapeHtml(overlay.label)}</div>`;
  });
  return `<div class="shot"><img src="${image.file}" width="${image.width}" height="${image.height}" alt="">
${masks.length > 0 ? `<svg viewBox="0 0 ${image.width} ${image.height}" preserveAspectRatio="none">${masks.join("")}</svg>` : ""}
${boxes.join("\n")}</div>`;
}

function describeOrigins(origins: Origin[]): string {
  if (origins.length === 0) return "nowhere: not said, not in your ledger, not read";
  return origins.map((origin) => {
    if (origin.kind === "request") return "you said";
    if (origin.kind === "ledger") return "your ledger";
    return `read from ${origin.via} ${escapeHtml(origin.domain)}`;
  }).join(" · ");
}

function shortOrigins(origins: Origin[]): string {
  if (origins.some((origin) => origin.kind === "ledger")) return "your ledger";
  if (origins.some((origin) => origin.kind === "request")) return "you said";
  const foreign = origins.find((origin) => origin.kind === "foreign");
  return foreign && foreign.kind === "foreign" ? `read from ${foreign.domain}` : "no source";
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}
