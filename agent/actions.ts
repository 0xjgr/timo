import type { Page } from "playwright";
import type { Trigger } from "../gate/gates.ts";
import type { Action } from "./responses.ts";

const KEY_NAMES: Record<string, string> = {
  ENTER: "Enter", RETURN: "Enter", TAB: "Tab", ESC: "Escape", ESCAPE: "Escape",
  BACKSPACE: "Backspace", DELETE: "Delete", SPACE: "Space", CTRL: "Control",
  CONTROL: "Control", ALT: "Alt", SHIFT: "Shift", CMD: "Meta", META: "Meta",
  UP: "ArrowUp", DOWN: "ArrowDown", LEFT: "ArrowLeft", RIGHT: "ArrowRight",
  ARROWUP: "ArrowUp", ARROWDOWN: "ArrowDown", ARROWLEFT: "ArrowLeft", ARROWRIGHT: "ArrowRight",
  PAGEUP: "PageUp", PAGEDOWN: "PageDown", HOME: "Home", END: "End",
};

function toPlaywrightKey(key: string): string {
  return KEY_NAMES[key.toUpperCase()] ?? (key.length === 1 ? key : key.charAt(0).toUpperCase() + key.slice(1));
}

function toButton(button?: string): "left" | "right" | "middle" {
  if (button === "right") return "right";
  if (button === "wheel") return "middle";
  return "left";
}

export async function runAction(page: Page, action: Action): Promise<void> {
  switch (action.type) {
    case "click":
      if (action.button === "back") return void (await page.goBack());
      if (action.button === "forward") return void (await page.goForward());
      return page.mouse.click(action.x, action.y, { button: toButton(action.button) });
    case "double_click":
      return page.mouse.dblclick(action.x, action.y);
    case "drag": {
      const [first, ...rest] = action.path;
      if (!first) return;
      await page.mouse.move(first.x, first.y);
      await page.mouse.down();
      for (const point of rest) await page.mouse.move(point.x, point.y);
      return page.mouse.up();
    }
    case "keypress":
      return page.keyboard.press(action.keys.map(toPlaywrightKey).join("+"));
    case "move":
      return page.mouse.move(action.x, action.y);
    case "scroll":
      await page.mouse.move(action.x, action.y);
      return page.mouse.wheel(action.scroll_x, action.scroll_y);
    case "type":
      return page.keyboard.type(action.text);
    case "wait":
      return page.waitForTimeout(1000);
    case "screenshot":
      return;
  }
}

export function describeAction(action: Action): string {
  const { type, ...rest } = action;
  return `${type} ${JSON.stringify(rest)}`;
}

// note: a typed newline submits the form, so it becomes its own enter press the gate can see
export function splitTyping(actions: Action[]): Action[] {
  return actions.flatMap((action): Action[] => {
    if (action.type !== "type" || !action.text.includes("\n")) return [action];
    return action.text.split("\n").flatMap((line, index): Action[] => {
      const enter: Action[] = index > 0 ? [{ type: "keypress", keys: ["ENTER"] }] : [];
      return line === "" ? enter : [...enter, { type: "type", text: line }];
    });
  });
}

export function findTrigger(action: Action): Trigger | null {
  if (action.type === "click" && (action.button === undefined || action.button === "left")) return { kind: "click", x: action.x, y: action.y };
  if (action.type === "double_click") return { kind: "click", x: action.x, y: action.y };
  if (action.type === "keypress" && action.keys.some((key) => ["ENTER", "RETURN"].includes(key.toUpperCase()))) return { kind: "enter" };
  if (action.type === "keypress" && action.keys.some((key) => key === " " || key.toUpperCase() === "SPACE")) return { kind: "space" };
  return null;
}
