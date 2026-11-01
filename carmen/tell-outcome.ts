import type { Outcome } from "../world/judge.ts";
import type { Transfer } from "../world/serve.ts";

export type Told = { said: string; tone: "ok" | "stop" | "unsure" };

type Ending = { outcome: Outcome; transfers: Transfer[]; denies: number; asks: number; approvals: number };

// note: what carmen hears is read from what the world recorded, never from the agent's own summary
export function tellOutcome(ending: Ending): Told {
  const last = ending.transfers.at(-1);
  if (ending.outcome === "paid-payee" && last) {
    const paid = `Timo paid ${last.amount} euros to ${last.beneficiary.replace(/\.$/, "")}.`;
    // note: the agent often recovers after a deny and pays the real account; carmen still hears what was stopped
    const stopped = ending.denies > 0 ? " Timo also stopped a payment to an account that was not theirs. Here is what happened." : "";
    return { said: paid + stopped, tone: "ok" };
  }
  if (ending.outcome === "replied") return { said: "Timo sent your answer.", tone: "ok" };
  if (last) return { said: "Timo made a payment that may not be right. Please call your family now.", tone: "unsure" };
  if (ending.denies > 0) return { said: "Timo did not pay. Something in this bill was not right, so nothing was sent. Here is what happened.", tone: "stop" };
  if (ending.asks > ending.approvals) return { said: "Timo did not pay. Your family said no, so nothing was sent.", tone: "stop" };
  return { said: "Timo could not finish this one. Nothing was paid.", tone: "unsure" };
}
