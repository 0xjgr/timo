import type { Page } from "playwright";

export type FormField = { name: string; label: string; type: string; value: string };

export type PendingForm = { action: string; method: string; fields: FormField[] };

type Trigger = { kind: "click"; x: number; y: number } | { kind: "enter" };

// note: reads the form as it is right now, including values the page pre-filled or a script changed
export function readPendingForm(page: Page, trigger: Trigger): Promise<PendingForm | null> {
  return page.evaluate((trigger) => {
    const findForm = (): HTMLFormElement | null => {
      if (trigger.kind === "enter") {
        const active = document.activeElement;
        const isTextEntry = active instanceof HTMLInputElement && !["button", "checkbox", "radio", "reset"].includes(active.type);
        return isTextEntry ? active.form : null;
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
      return [{ name: element.name, label: label.trim(), type: element.type, value: element.value }];
    });
    return { action: form.action, method: form.method, fields };
  }, trigger);
}
