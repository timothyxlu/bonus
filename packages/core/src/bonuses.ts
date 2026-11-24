import { daysBetween } from "./dates";
import type { BonusStatus, IsoDate } from "./types";

export interface BonusLike {
  amountRequired: number | null;
  progress: number | null;
  deadline: IsoDate | null;
  status: BonusStatus;
}

export function bonusProgress(b: BonusLike, asOf: IsoDate) {
  const required = b.amountRequired ?? 0;
  const progress = b.progress ?? 0;
  const ratio = required > 0 ? Math.min(1, progress / required) : b.status === "in_progress" ? 0 : 1;
  const daysLeft = b.deadline ? daysBetween(asOf, b.deadline) : null;
  const remaining = Math.max(0, required - progress);
  const active = b.status === "in_progress";
  return {
    ratio,
    remaining,
    daysLeft,
    overdue: active && daysLeft !== null && daysLeft < 0,
    active,
  };
}
