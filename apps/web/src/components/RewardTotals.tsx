import { REWARD_UNITS } from "@bonus/core";
import { t, td } from "../i18n";
import { fmtNum, fmtUsd } from "../lib/format";
import type { UnitTotals } from "../lib/types";

/** Points, miles and dollars never get added together: one figure per unit. */
export function RewardTotals({ totals, size = "lg" }: { totals: UnitTotals; size?: "lg" | "sm" }) {
  const parts = REWARD_UNITS.filter((u) => totals[u]);
  if (parts.length === 0) return <p className="text-sm text-muted">{t("hunt.nothingYet")}</p>;
  return (
    <ul className="space-y-0.5">
      {parts.map((u) => (
        <li key={u} className="tabular flex items-baseline gap-1.5">
          <span className={size === "lg" ? "text-2xl font-semibold tracking-tight" : "text-base font-semibold"}>
            {u === "USD" ? fmtUsd(totals[u]!) : fmtNum(totals[u]!)}
          </span>
          {u !== "USD" && <span className="text-sm text-muted">{td(`unit.${u}`)}</span>}
        </li>
      ))}
    </ul>
  );
}

export function sumByUnit(rows: { rewardUnit: string; rewardAmount: number | null }[]): UnitTotals {
  const out: UnitTotals = {};
  for (const r of rows) if (r.rewardAmount) out[r.rewardUnit as keyof UnitTotals] = (out[r.rewardUnit as keyof UnitTotals] ?? 0) + r.rewardAmount;
  return out;
}
