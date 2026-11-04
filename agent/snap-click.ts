import type { Page } from "playwright";
import { readSettled } from "../gate/pending-form.ts";
import type { Action } from "./responses.ts";

const SNAP_PX = 20;

// note: the model often clicks a few px off a text link (15 px above "View my bill" in two oct 30 runs) and burns its steps
// threat: a near miss must never become a payment, so it snaps to links and text fields only, never to a button or submit
export async function snapClick(page: Page, action: Action): Promise<Action> {
  if (action.type !== "click" && action.type !== "double_click") return action;
  if (action.type === "click" && action.button !== undefined && action.button !== "left") return action;
  const target = await readSettled(page, () => page.evaluate(([x, y, reach]) => {
    const SNAPPABLE = 'a[href], input:is([type=text], [type=search], [type=email], [type=tel], [type=number], [type=password], :not([type])), textarea, select';
    const ACTIVE = `${SNAPPABLE}, button, [role=button], label, input`;
    const hit = document.elementFromPoint(x, y);
    if (!hit || hit.closest(ACTIVE)) return null;
    let best: { x: number; y: number; gap: number } | null = null;
    for (const element of document.querySelectorAll(SNAPPABLE)) {
      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      const gap = Math.hypot(Math.max(box.left - x, 0, x - box.right), Math.max(box.top - y, 0, y - box.bottom));
      if (gap <= reach && (!best || gap < best.gap)) best = { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2), gap };
    }
    return best;
  }, [action.x, action.y, SNAP_PX] as const));
  if (!target) return action;
  console.log(`[agent] snap from=${action.x},${action.y} to=${target.x},${target.y} gap=${target.gap.toFixed(0)}`);
  return { ...action, x: target.x, y: target.y };
}
