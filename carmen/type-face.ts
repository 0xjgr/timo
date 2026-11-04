import { readFileSync } from "node:fs";

// note: atkinson hyperlegible was drawn for readers with low vision, which is who carmen is;
// inlined so the pages' csp needs only font-src data:
const FILES = [
  ["Timo Sans", 400, "sans-400"],
  ["Timo Sans", 700, "sans-700"],
  ["Timo Sans", 800, "sans-800"],
  ["Timo Mono", 400, "mono-400"],
  ["Timo Mono", 700, "mono-700"],
] as const;

export const FONT_FACES = FILES.map(([family, weight, file]) => {
  const bytes = readFileSync(new URL(`./fonts/${file}.woff2`, import.meta.url)).toString("base64");
  return `@font-face { font-family: "${family}"; font-weight: ${weight}; font-display: block; src: url(data:font/woff2;base64,${bytes}) format("woff2"); }`;
}).join("\n");

export const SANS = `"Timo Sans", "DejaVu Sans", system-ui, sans-serif`;
export const MONO = `"Timo Mono", "DejaVu Sans Mono", ui-monospace, monospace`;
