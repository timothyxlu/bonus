import { daysBetween } from "./dates";
import type { BonusRequirementType, BonusStatus, IsoDate } from "./types";

/**
 * One condition of a multi-step bonus, e.g. "deposit $15,000 of new money by 01-15"
 * followed by "keep at least $15,000 through 04-15". All steps together are one bonus.
 */
export interface BonusStep {
  type: BonusRequirementType;
  /** Target in USD: amount to deposit / spend, or the minimum balance to keep. Null for a step checked off by hand. */
  amount: number | null;
  /** Done so far (deposited / spent), or the current balance for a balance step. */
  progress: number;
  /** Finish this step by this date (inclusive). */
  dueBy: IsoDate | null;
  /** Balance steps: the hold starts on this date (defaults to the previous step's dueBy). */
  holdFrom: IsoDate | null;
  /** Balance steps: keep at least `amount` through this date (inclusive); met once it has passed. */
  holdUntil: IsoDate | null;
  description: string | null;
  /** Marked complete by hand (overrides the computed state). */
  done: boolean;
}

export type BonusStepState = "done" | "holding" | "pending" | "overdue";

export interface BonusLike {
  amountRequired: number | null;
  progress: number | null;
  deadline: IsoDate | null;
  status: BonusStatus;
  steps?: BonusStep[] | null;
}

export function bonusStepProgress(s: BonusStep, asOf: IsoDate, prevDueBy: IsoDate | null = null) {
  const amount = s.amount ?? 0;
  const reached = amount > 0 && s.progress >= amount;
  const holdStart = s.holdFrom ?? prevDueBy;
  let state: BonusStepState;
  let ratio: number;
  if (s.done) {
    state = "done";
    ratio = 1;
  } else if (s.holdUntil) {
    if (reached && asOf > s.holdUntil) state = "done";
    else if (reached) state = "holding";
    else if ((s.dueBy && asOf > s.dueBy) || asOf > s.holdUntil) state = "overdue";
    else state = "pending";
    if (state === "done") ratio = 1;
    else if (state === "holding") {
      // Time-based once the balance is there; without a start date the hold sits just short of full.
      const total = holdStart ? daysBetween(holdStart, s.holdUntil) + 1 : 0;
      ratio = total > 0 ? Math.min(0.99, Math.max(0, daysBetween(holdStart!, asOf)) / total) : 0.9;
    } else ratio = amount > 0 ? Math.min(0.99, s.progress / amount) : 0;
  } else {
    if (reached) state = "done";
    else if (s.dueBy && asOf > s.dueBy) state = "overdue";
    else state = "pending";
    ratio = state === "done" ? 1 : amount > 0 ? Math.min(1, s.progress / amount) : 0;
  }
  /** The date that matters next: end of the hold while holding, otherwise the due date. */
  const dueDate = state === "done" ? null : state === "holding" ? s.holdUntil : (s.dueBy ?? s.holdUntil);
  return {
    ...s,
    state,
    ratio,
    remaining: state === "done" || state === "holding" ? 0 : Math.max(0, amount - s.progress),
    dueDate,
    daysLeft: dueDate ? daysBetween(asOf, dueDate) : null,
  };
}

export function bonusProgress(b: BonusLike, asOf: IsoDate) {
  const active = b.status === "in_progress";
  const steps = b.steps ?? [];
  if (steps.length) {
    const computed = steps.map((s, i) => bonusStepProgress(s, asOf, i > 0 ? steps[i - 1]!.dueBy : null));
    const met = computed.filter((s) => s.state === "done").length;
    const currentIdx = computed.findIndex((s) => s.state !== "done");
    const current = currentIdx >= 0 ? computed[currentIdx]! : null;
    const finished = !active;
    const dueDate = current?.dueDate ?? b.deadline;
    const daysLeft = dueDate ? daysBetween(asOf, dueDate) : null;
    return {
      ratio: finished && b.status !== "failed" && b.status !== "cancelled" ? 1 : computed.reduce((sum, s) => sum + s.ratio, 0) / computed.length,
      remaining: current?.remaining ?? 0,
      daysLeft,
      dueDate,
      overdue: active && computed.some((s) => s.state === "overdue"),
      active,
      steps: computed,
      stepsMet: met,
      /** Index of the first step not yet done, or null when every step is met. */
      currentStep: currentIdx >= 0 ? currentIdx : null,
      allStepsMet: met === computed.length,
    };
  }
  const required = b.amountRequired ?? 0;
  const progress = b.progress ?? 0;
  const ratio = required > 0 ? Math.min(1, progress / required) : b.status === "in_progress" ? 0 : 1;
  const daysLeft = b.deadline ? daysBetween(asOf, b.deadline) : null;
  const remaining = Math.max(0, required - progress);
  return {
    ratio,
    remaining,
    daysLeft,
    dueDate: b.deadline,
    overdue: active && daysLeft !== null && daysLeft < 0,
    active,
    steps: [] as ReturnType<typeof bonusStepProgress>[],
    stepsMet: 0,
    currentStep: null as number | null,
    allStepsMet: false,
  };
}
