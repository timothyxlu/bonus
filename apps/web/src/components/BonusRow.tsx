import { t, td } from "../i18n";
import { fmtNum, fmtUsd } from "../lib/format";
import type { Bonus } from "../lib/types";
import { Badge, ProgressBar } from "./ui";

export function daysLabel(b: { daysLeft: number | null; overdue: boolean }) {
  if (b.daysLeft === null) return null;
  return b.overdue ? t("detail.overdue", { n: -b.daysLeft }) : t("detail.daysLeft", { n: b.daysLeft });
}

export function BonusProgress({ b, title }: { b: Bonus; title?: string }) {
  const urgent = b.active && b.daysLeft !== null && b.daysLeft <= 14;
  return (
    <div className="space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {title && <p className="truncate text-sm font-medium">{title}</p>}
          <p className="text-xs text-slate-500">
            {td(`req.${b.requirementType}`)} {fmtUsd(b.progress)} / {fmtUsd(b.amountRequired)}
            {b.rewardAmount !== null && (
              <>
                {" → "}
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {fmtNum(b.rewardAmount)} {td(`unit.${b.rewardUnit}`)}
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {b.active ? (
            daysLabel(b) && <Badge tone={b.overdue ? "red" : urgent ? "amber" : "slate"}>{daysLabel(b)}</Badge>
          ) : (
            <Badge tone={b.status === "posted" || b.status === "met" ? "green" : "slate"}>{td(`bonusStatus.${b.status}`)}</Badge>
          )}
          {b.deadline && <span className="tabular text-[11px] text-slate-500">{b.deadline}</span>}
        </div>
      </div>
      <ProgressBar ratio={b.ratio} tone={b.ratio >= 1 ? "green" : urgent ? "amber" : "indigo"} />
    </div>
  );
}
