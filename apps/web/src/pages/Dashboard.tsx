import { BonusProgress } from "../components/BonusRow";
import { Badge, Button, Card, Empty, ErrorText, Spinner, Stat } from "../components/ui";
import { t } from "../i18n";
import { api } from "../lib/api";
import { fmtUsd, todayIso } from "../lib/format";
import { useDashboard, useMutate } from "../lib/queries";
import { Link } from "../lib/router";
import type { Benefit } from "../lib/types";

export function DashboardPage() {
  const { data, isLoading, error } = useDashboard();
  const markUsed = useMutate((b: Benefit) => api.post(`/benefits/${b.id}/uses`, { usedOn: todayIso(), amount: b.remaining }));
  if (isLoading) return <Spinner />;
  if (error || !data) return <ErrorText error={error} />;
  const f = data.five24;

  return (
    <div className="space-y-4 lg:space-y-6">
      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-4">
        {/* 5/24 */}
        <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 p-5 text-white shadow-sm md:col-span-2 xl:col-span-2">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm/5 opacity-90">{t("dash.five24")}</p>
              <p className="text-xs opacity-75">{t("dash.five24.sub")}</p>
            </div>
            <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium">
              {f.under ? t("dash.five24.under") : t("dash.five24.over", { date: f.eligibleFrom ?? "—" })}
            </span>
          </div>
          <p className="tabular mt-3 text-5xl font-bold">
            {f.count}
            <span className="text-2xl font-medium opacity-70">/24</span>
          </p>
          <p className="mt-2 text-sm opacity-90">{f.nextDropDate ? t("dash.nextDrop", { date: f.nextDropDate }) : t("dash.noDrop")}</p>
          {f.unknownDates.length > 0 && <p className="mt-1 text-xs text-amber-200">{t("dash.unknownDates", { n: f.unknownDates.length })}</p>}
          {f.counted.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {f.counted.map((c) => (
                <span key={c.id} className="rounded-md bg-white/15 px-2 py-1 text-[11px]">
                  {c.label} · {t("dash.dropsOn", { date: c.dropsOn })}
                </span>
              ))}
            </div>
          )}
        </div>
        <Stat label={t("dash.openAccounts")} value={data.stats.openAccounts} sub={t("dash.total", { n: data.stats.totalAccounts })} />
        <Stat label={t("dash.annualFees")} value={fmtUsd(data.stats.annualFees)} sub={`${t("dash.activeBonuses")} ${data.stats.activeBonuses}`} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:gap-6 xl:grid-cols-2">
        <Card title={t("dash.deadlines")} action={<Link to="/accounts" className="text-xs text-indigo-600">{t("nav.accounts")} →</Link>}>
          {data.deadlines.length === 0 ? (
            <Empty>{t("dash.noDeadlines")}</Empty>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.deadlines.map((b) => (
                <li key={b.id} className="py-3 first:pt-0 last:pb-0">
                  <Link to={`/accounts/${b.accountId}`} className="block">
                    <BonusProgress b={b} title={b.accountLabel} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={`${t("dash.unused")} · ${data.unusedBenefits.length}`} action={<Link to="/benefits" className="text-xs text-indigo-600">{t("nav.benefits")} →</Link>}>
          {data.unusedBenefits.length === 0 ? (
            <Empty>{t("dash.noUnused")}</Empty>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.unusedBenefits.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{b.name}</p>
                    <p className="truncate text-xs text-slate-500">
                      {b.accountLabel} · {t("detail.periodEnds", { date: b.currentPeriod.end })}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone="amber">{fmtUsd(b.remaining)}</Badge>
                    <Button size="sm" onClick={() => markUsed.mutate(b)} disabled={markUsed.isPending}>
                      {t("detail.markUsed")}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
