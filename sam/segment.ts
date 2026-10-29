import { parseImageStream, recordsOfKind, type SegmentationMask } from "@meta-sam/parser";
import { createResponse } from "../agent/responses.ts";

export type Region = { left: number; top: number; right: number; bottom: number; mask?: SegmentationMask };

export type Segmentation = { ok: true; value: Region[] } | { ok: false; error: string };

export const SAM_USD_PER_IMAGE = 0.0025;

// note: one concept per call, a short noun phrase ("logo", "qr code"); zero matches is a normal answer
export async function segmentImage(png: Buffer, concept: string): Promise<Segmentation> {
  const reply = await createResponse({
    model: "sam-3.1",
    store: false,
    input: [{
      type: "message",
      role: "user",
      content: [
        { type: "input_text", text: concept },
        { type: "input_image", image_url: `data:image/png;base64,${png.toString("base64")}` },
      ],
    }],
    metadata: { mask_encoding: "one_bit" },
  });
  if (!reply.ok) return reply;
  const text = readOutputText(reply.value.output);
  if (text === "") return { ok: true, value: [] };
  // note: the official parser reads events, so the finished text is replayed as one delta
  const lane = { item_id: "sam", output_index: 0, content_index: 0 };
  const events = (async function* () {
    yield { type: "response.output_text.delta" as const, delta: text, ...lane };
    yield { type: "response.output_text.done" as const, text, ...lane };
    yield { type: "response.completed" as const };
  })();
  const result = await parseImageStream(events).finalResult;
  const masks = recordsOfKind(result.records, "mask");
  const regions = recordsOfKind(result.records, "box").map((box): Region => ({
    left: box.left,
    top: box.top,
    right: box.right,
    bottom: box.bottom,
    mask: masks.find((mask) => mask.objectId === box.objectId)?.mask,
  }));
  return { ok: true, value: regions };
}

function readOutputText(output: unknown[]): string {
  return output
    .flatMap((item: any) => (item?.type === "message" ? item.content : []))
    .filter((part: any) => part?.type === "output_text")
    .map((part: any) => String(part.text))
    .join("");
}
