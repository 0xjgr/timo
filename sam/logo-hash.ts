import { PNG } from "pngjs";
import type { Region } from "./segment.ts";

export type Bitmap = { width: number; height: number; rgba: Uint8Array };

// note: two renders of one logo land within a few bits; unrelated marks sit near 32
export const MAX_LOGO_DISTANCE = 10;

export function decodePng(png: Buffer): Bitmap {
  const image = PNG.sync.read(png);
  return { width: image.width, height: image.height, rgba: image.data };
}

// note: difference hash on a 9x8 gray grid, so size and small shifts of the crop do not matter
export function hashRegion(bitmap: Bitmap, region: Region): string {
  const cols = 9;
  const rows = 8;
  const width = Math.max(1, region.right - region.left);
  const height = Math.max(1, region.bottom - region.top);
  const cells: number[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x1 = region.left + Math.floor((col * width) / cols);
      const x2 = region.left + Math.max(Math.floor(((col + 1) * width) / cols), Math.floor((col * width) / cols) + 1);
      const y1 = region.top + Math.floor((row * height) / rows);
      const y2 = region.top + Math.max(Math.floor(((row + 1) * height) / rows), Math.floor((row * height) / rows) + 1);
      cells.push(averageGray(bitmap, x1, y1, x2, y2));
    }
  }
  let bits = 0n;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols - 1; col++) {
      bits = (bits << 1n) | (cells[row * cols + col]! > cells[row * cols + col + 1]! ? 1n : 0n);
    }
  }
  return bits.toString(16).padStart(16, "0");
}

export function measureDistance(a: string, b: string): number {
  let diff = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let count = 0;
  while (diff > 0n) {
    count += Number(diff & 1n);
    diff >>= 1n;
  }
  return count;
}

function averageGray(bitmap: Bitmap, x1: number, y1: number, x2: number, y2: number): number {
  let sum = 0;
  let count = 0;
  for (let y = Math.max(0, y1); y < Math.min(bitmap.height, y2); y++) {
    for (let x = Math.max(0, x1); x < Math.min(bitmap.width, x2); x++) {
      const at = (y * bitmap.width + x) * 4;
      sum += 0.299 * bitmap.rgba[at]! + 0.587 * bitmap.rgba[at + 1]! + 0.114 * bitmap.rgba[at + 2]!;
      count++;
    }
  }
  return count === 0 ? 0 : sum / count;
}
