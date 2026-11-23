import { BonusProgress } from "../components/BonusRow";
import { Five24Meter } from "../components/Five24Meter";
import { Button, Card, Empty, ErrorText, Spinner } from "../components/ui";
import { t } from "../i18n";
import { api } from "../lib/api";
import { cx, fmtUsd, todayIso } from "../lib/format";
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
      <header className="hidden items-baseline justify-between lg:flex">
        <h1 className="text-2xl font-semibold tracking-tight">{t("dash.title")}</h1>
        <p className="tabular text-sm text-muted">{data.today}</p>
      </header>

      <section className="rounded-[var(--radius-panel)] border border-line bg-surface p-4 sm:p-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_220px]">
          <div>
            <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <h2 className="text-base font-semibold">{t("dash.five24")}</h2>
              <p className="tabular text-3xl font-semibold tracking-tight">
                {f.count}
                <span className="text-lg font-medium text-muted">/24</span>
              </p>
              <p className={cx("text-sm font-medium", f.under ? "text-money" : "text-warn")}>
                {f.under ? t("dash.five24.room", { n: 4 - f.count }) : t("dash.five24.full", { date: f.eligibleFrom ?? "—" })}
              </p>
            </div>
            <Five24Meter s={f} />
            <p className="mt-3 text-sm text-muted">
              {t("dash.five24.sub")}
              {f.nextDropDate && <>，{t("dash.nextDrop", { date: f.nextDropDate })}</>}
            </p>
            {f.unknownDates.length > 0 && <p className="mt-1 text-sm text-warn">{t("dash.unknownDates", { n: f.unknownDates.length })}</p>}
          </div>
          <dl className="grid grid-cols-3 gap-3 border-t border-line pt-4 lg:grid-cols-1 lg:content-start lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
            <Stat label={t("dash.openAccounts")} value={String(data.stats.openAccounts)} hint={t("dash.total", { n: data.stats.totalAccounts })} />
            <Stat label={t("dash.annualFees")} value={fmtUsd(data.stats.annualFees)} />
            <Stat label={t("dash.activeBonuses")} value={String(data.stats.activeBonuses)} />
          </dl>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:gap-6 xl:grid-cols-2">
        <Card title={t("dash.deadlines")} action={<Link to="/accounts" className="rounded px-2 py-1 text-sm font-medium text-brand hover:bg-brand-soft">{t("dash.viewAll")}</Link>}>
          {data.deadlines.length === 0 ? (
            <Empty>{t("dash.noDeadlines")}</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {data.deadlines.map((b) => (
                <li key={b.id}>
                  <Link to={`/accounts/${b.accountId}`} className="-mx-2 block rounded-[var(--radius-row)] px-2 py-3 hover:bg-sunken">
                    <BonusProgress b={b} title={b.accountLabel} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title={
            <>
              {t("dash.unused")} <span className="tabular ml-1 text-muted">{data.unusedBenefits.length}</span>
            </>
          }
          action={<Link to="/benefits" className="rounded px-2 py-1 text-sm font-medium text-brand hover:bg-brand-soft">{t("dash.viewAll")}</Link>}
        >
          {data.unusedBenefits.length === 0 ? (
            <Empty>{t("dash.noUnused")}</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {data.unusedBenefits.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{b.name}</p>
                    <p className="truncate text-xs text-muted">{b.accountLabel}</p>
                    <p className="tabular text-xs text-faint">{t("detail.periodEnds", { date: b.currentPeriod.end })}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="tabular text-sm font-semibold text-warn">{fmtUsd(b.remaining)}</span>
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

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="tabular text-xl font-semibold">{value}</dd>
      {hint && <dd className="hidden text-xs text-faint sm:block">{hint}</dd>}
    </div>
  );
}
