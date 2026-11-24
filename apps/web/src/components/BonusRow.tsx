import { t, td } from "../i18n";
import { cx, fmtNum, fmtUsd } from "../lib/format";
import type { Bonus, BonusStepProgress } from "../lib/types";
import { Badge, ProgressBar } from "./ui";

export function daysLabel(b: { daysLeft: number | null; overdue: boolean }) {
  if (b.daysLeft === null) return null;
  return b.overdue ? t("detail.overdue", { n: -b.daysLeft }) : t("detail.daysLeft", { n: b.daysLeft });
}

const stepTone = (s: BonusStepProgress["state"]) => (s === "done" ? "green" : s === "holding" ? "indigo" : s === "overdue" ? "red" : "slate");

function rewardText(b: Bonus) {
  if (b.rewardAmount === null) return null;
  return b.rewardUnit === "USD" ? fmtUsd(b.rewardAmount) : `${fmtNum(b.rewardAmount)} ${td(`unit.${b.rewardUnit}`)}`;
}

/** One line per condition of a multi-step bonus. */
export function BonusSteps({ b }: { b: Bonus }) {
  return (
    <ol className="space-y-1" aria-label={t("bonus.steps")}>
      {b.steps.map((s, i) => (
        <li key={i} className={cx("flex items-start gap-2 text-xs", b.active && b.currentStep === i ? "text-ink" : "text-muted")}>
          <span className="tabular mt-0.5 w-4 shrink-0 text-right text-faint">{i + 1}.</span>
          <span className="min-w-0 flex-1">
            <span className="font-medium">{td(`req.${s.type}`)}</span>
            {s.amount !== null && s.amount > 0 && <> {fmtUsd(s.progress)} / {fmtUsd(s.amount)}</>}
            {s.description && <span className="block truncate">{s.description}</span>}
            <span className="tabular block text-faint">
              {[s.dueBy && t("bonus.step.dueByShort", { date: s.dueBy }), s.holdUntil && t("bonus.step.holdUntilShort", { date: s.holdUntil })].filter(Boolean).join(" · ")}
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-end gap-0.5">
            <Badge tone={stepTone(s.state)}>{td(`bonus.stepState.${s.state}`)}</Badge>
            {s.state === "holding" && s.daysLeft !== null && s.daysLeft >= 0 && <span className="tabular text-faint">{t("bonus.holdDaysLeft", { n: s.daysLeft })}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function BonusProgress({ b, title }: { b: Bonus; title?: string }) {
  const urgent = b.active && b.daysLeft !== null && b.daysLeft <= 14;
  const multi = (b.steps?.length ?? 0) > 0;
  const reward = rewardText(b);
  const date = multi ? b.dueDate : b.deadline;
  return (
    <div className="space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {title && <p className="truncate text-sm font-medium">{title}</p>}
          <p className="text-xs text-muted">
            {multi ? t("bonus.stepsMet", { met: b.stepsMet, total: b.steps.length }) : <>{td(`req.${b.requirementType}`)} {fmtUsd(b.progress)} / {fmtUsd(b.amountRequired)}</>}
            {reward && (
              <>
                {" → "}
                <span className="font-medium text-ink">{reward}</span>
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
          {date && <span className="tabular text-xs text-muted">{date}</span>}
        </div>
      </div>
      <ProgressBar ratio={b.ratio} tone={b.ratio >= 1 ? "green" : urgent ? "amber" : "indigo"} />
      {multi && <BonusSteps b={b} />}
    </div>
  );
}
