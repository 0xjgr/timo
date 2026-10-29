import type { Page } from "playwright";

// note: rect is where the field sat on screen at the commit, for the lens; a network body has none
export type FormField = { name: string; label: string; type: string; value: string; rect?: { x: number; y: number; width: number; height: number } };

export type PendingForm = { action: string; method: string; fields: FormField[] };

type Trigger = { kind: "click"; x: number; y: number } | { kind: "enter" } | { kind: "space" };

// note: reads the form as it is right now, including values the page pre-filled or a script changed
export function readPendingForm(page: Page, trigger: Trigger): Promise<PendingForm | null> {
  return page.evaluate((trigger) => {
    const findForm = (): HTMLFormElement | null => {
      const active = document.activeElement;
      // threat: tab to the send button and press enter or space, a submit with no click on it
      const focusedSubmit = active instanceof HTMLButtonElement && active.type === "submit" ? active.form
        : active instanceof HTMLInputElement && ["submit", "image"].includes(active.type) ? active.form
        : null;
      if (trigger.kind === "space") return focusedSubmit;
      if (trigger.kind === "enter") {
        const isTextEntry = active instanceof HTMLInputElement && !["button", "checkbox", "radio", "reset", "submit", "image"].includes(active.type);
        return focusedSubmit ?? (isTextEntry ? active.form : null);
      }
      const hit = document.elementFromPoint(trigger.x, trigger.y)?.closest("button, input");
      if (hit instanceof HTMLButtonElement && hit.type === "submit") return hit.form;
      if (hit instanceof HTMLInputElement && (hit.type === "submit" || hit.type === "image")) return hit.form;
      return null;
    };
    const form = findForm();
    if (!form) return null;
    const fields = [...form.elements].flatMap((element) => {
      if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) return [];
      // threat: hidden inputs are kept, a cloned form can carry the iban out of sight
      if (element.value.trim() === "" || element.type === "submit") return [];
      const label = element.labels?.[0]?.innerText ?? element.getAttribute("aria-label") ?? element.getAttribute("placeholder") ?? "";
      const box = element.getBoundingClientRect();
      const rect = { x: box.x, y: box.y, width: box.width, height: box.height };
      return [{ name: element.name, label: label.trim(), type: element.type, value: element.value, rect }];
    });
    return { action: form.action, method: form.method, fields };
  }, trigger);
}
