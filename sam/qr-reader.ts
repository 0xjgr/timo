import jsqr from "jsqr";
import { decodePng, type Bitmap } from "./logo-hash.ts";
import { segmentImage, type Region } from "./segment.ts";

// note: jsqr's typings declare an es default export, but the package is commonjs and node hands over the function itself
const readCode = jsqr as unknown as (rgba: Uint8ClampedArray, width: number, height: number) => { data: string } | null;

export type QrReading = { ok: true; value: { text: string; region: Region }[] } | { ok: false; error: string };

// note: sam finds the code in a busy photo, then a deterministic decoder reads it. no model ever
// transcribes the link, so a model cannot be talked into reading a different one
export async function readQrCodes(png: Buffer): Promise<QrReading> {
  const segmentation = await segmentImage(png, "qr code");
  if (!segmentation.ok) return segmentation;
  const bitmap = decodePng(png);
  const codes = segmentation.value.flatMap((region) => {
    const crop = cropBitmap(bitmap, padRegion(region, bitmap));
    const code = readCode(new Uint8ClampedArray(crop.rgba), crop.width, crop.height);
    return code ? [{ text: code.data, region }] : [];
  });
  return { ok: true, value: codes };
}

// note: the decoder needs the quiet zone around the code, which a tight box can clip
function padRegion(region: Region, bitmap: Bitmap): Region {
  const pad = Math.round(Math.max(region.right - region.left, region.bottom - region.top) * 0.15);
  return {
    left: Math.max(0, region.left - pad),
    top: Math.max(0, region.top - pad),
    right: Math.min(bitmap.width, region.right + pad),
    bottom: Math.min(bitmap.height, region.bottom + pad),
  };
}

function cropBitmap(bitmap: Bitmap, region: Region): Bitmap {
  const width = region.right - region.left;
  const height = region.bottom - region.top;
  const rgba = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row++) {
    const from = ((region.top + row) * bitmap.width + region.left) * 4;
    rgba.set(bitmap.rgba.subarray(from, from + width * 4), row * width * 4);
  }
  return { width, height, rgba };
}
