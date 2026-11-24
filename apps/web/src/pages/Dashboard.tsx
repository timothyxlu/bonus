import { ACCOUNT_KINDS, type AccountKind } from "@bonus/core";
import type { ReactNode } from "react";
import { fmtBenefitAmount } from "../components/AccountDetail";
import { BonusProgress } from "../components/BonusRow";
import { Five24Meter } from "../components/Five24Meter";
import { KindIcon } from "../components/KindIcon";
import { RewardTotals } from "../components/RewardTotals";
import { Button, Card, Empty, ErrorText, IssuerChip, Spinner } from "../components/ui";
import { t, td } from "../i18n";
import { api } from "../lib/api";
import { cx, fmtUsd, todayIso } from "../lib/format";
import { KIND_META } from "../lib/kinds";
import { useDashboard, useMutate, useOpportunities } from "../lib/queries";
import { Link } from "../lib/router";
import type { Benefit, Dashboard, KindStats } from "../lib/types";

export function DashboardPage() {
  const { data, isLoading, error } = useDashboard();
  const markUsed = useMutate((b: Benefit) => api.post(`/benefits/${b.id}/uses`, { usedOn: todayIso(), amount: b.remaining }));
  if (isLoading) return <Spinner />;
  if (error || !data) return <ErrorText error={error} />;

  return (
    <div className="space-y-4 lg:space-y-6">
      <header className="hidden items-baseline justify-between lg:flex">
        <h1 className="text-2xl font-semibold tracking-tight">{t("dash.title")}</h1>
        <p className="tabular text-sm text-muted">{data.today}</p>
      </header>

      <Hunt data={data} />

      <TopOpportunities />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:gap-6 xl:grid-cols-4">
        {ACCOUNT_KINDS.map((k) => (
          <KindPanel key={k} kind={k} stats={data.byKind[k]} data={data} />
        ))}
      </div>

      {data.unusedBenefits.length > 0 && (
        <Card
          title={
            <>
              {t("dash.unused")} <span className="tabular ml-1 text-muted">{data.unusedBenefits.length}</span>
            </>
          }
          action={<ViewLink to="/benefits">{t("dash.viewAll")}</ViewLink>}
        >
          <ul className="grid grid-cols-1 gap-x-8 divide-y divide-line md:grid-cols-2 md:divide-y-0">
            {data.unusedBenefits.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 py-2.5 md:border-b md:border-line">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{b.name}</p>
                  <p className="truncate text-xs text-muted">{b.accountLabel}</p>
                  <p className="tabular text-xs text-faint">{t("detail.periodEnds", { date: b.currentPeriod.end })}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="tabular text-sm font-semibold text-warn">{fmtBenefitAmount(b, b.remaining)}</span>
                  <Button size="sm" onClick={() => markUsed.mutate(b)} disabled={markUsed.isPending}>
                    {t("detail.markUsed")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/** The three best offers you could open right now. */
function TopOpportunities() {
  const { data = [] } = useOpportunities(false);
  const top = data.filter((o) => o.eligibility.status !== "blocked" && o.value.netUsd > 0).slice(0, 3);
  if (top.length === 0) return null;
  return (
    <section className="rounded-[var(--radius-panel)] border border-line bg-surface p-4 sm:p-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{t("opp.top")}</h2>
        <ViewLink to="/opportunities">{t("opp.viewAll")}</ViewLink>
      </div>
      <ol className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {top.map((o) => (
          <li key={o.id}>
            <Link to={`/opportunities?focus=${encodeURIComponent(o.id)}`} className="flex h-full items-center gap-3 rounded-[var(--radius-row)] bg-sunken p-3 hover:bg-brand-soft">
              <IssuerChip issuer={o.institutionId} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{o.title}</p>
                <p className="text-xs text-muted">{td(`kind.${o.kind}`)}</p>
              </div>
              <span className="tabular text-lg font-semibold text-money">{fmtUsd(Math.round(o.value.netUsd))}</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ViewLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="rounded px-2 py-1 text-sm font-medium text-brand hover:bg-brand-soft">
      {children}
    </Link>
  );
}

/** The hero: every bonus being chased right now, whatever the category, plus the trophy count. */
function Hunt({ data }: { data: Dashboard }) {
  const r = data.rewards;
  return (
    <section className="overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="p-4 sm:p-6">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold">
              {t("dash.deadlines")} <span className="tabular ml-1 text-muted">{r.activeCount}</span>
            </h2>
            <ViewLink to="/bonuses">{t("dash.viewAll")}</ViewLink>
          </div>
          {data.deadlines.length === 0 ? (
            <Empty>{t("dash.noDeadlines")}</Empty>
          ) : (
            <ul className="-mb-px grid grid-cols-1 gap-x-8 md:grid-cols-2">
              {data.deadlines.map((b) => (
                <li key={b.id} className="border-b border-line">
                  <Link to={`/accounts/${b.accountId}`} className="-mx-2 block space-y-1.5 rounded-[var(--radius-row)] px-2 py-3 hover:bg-sunken">
                    <span className="flex min-w-0 items-center gap-2">
                      <IssuerChip issuer={b.institutionId} size="sm" />
                      <span className="truncate text-sm font-medium">{b.accountLabel}</span>
                      <span className="shrink-0 text-xs text-faint">{td(`kind.${b.kind}`)}</span>
                    </span>
                    <BonusProgress b={b} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <aside className="grid grid-cols-2 gap-4 border-t border-line bg-sunken p-4 sm:p-6 lg:grid-cols-1 lg:content-start lg:border-t-0 lg:border-l">
          <div>
            <p className="mb-1 text-sm text-muted">{t("hunt.earned", { year: r.year })}</p>
            <RewardTotals totals={r.earnedThisYear} />
          </div>
          <div>
            <p className="mb-1 text-sm text-muted">{t("hunt.potential")}</p>
            <RewardTotals totals={r.pending} size="sm" />
          </div>
        </aside>
      </div>
    </section>
  );
}

function Fact({ children, tone }: { children: ReactNode; tone?: "warn" | "money" }) {
  return <li className={cx("tabular text-sm", tone === "warn" ? "text-warn" : tone === "money" ? "text-money" : "text-muted")}>{children}</li>;
}

function KindPanel({ kind, stats, data }: { kind: AccountKind; stats: KindStats; data: Dashboard }) {
  const isCard = kind === "credit_card";
  const name = t(KIND_META[kind].plural);
  return (
    <section className={cx("flex flex-col rounded-[var(--radius-panel)] border border-line bg-surface p-4 sm:p-5", isCard && "md:col-span-2")}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <span className="text-brand">
            <KindIcon kind={kind} />
          </span>
          {name}
        </h2>
        <ViewLink to={`/accounts?kind=${kind}`}>{t("cat.view")}</ViewLink>
      </div>
      {stats.total === 0 ? (
        <p className="py-2 text-sm text-muted">{t("cat.empty", { kind: name })}</p>
      ) : (
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          <Fact>{t("cat.open", { n: stats.open })}</Fact>
          {(kind !== "gift_card" || stats.activeBonuses > 0) && (
            <Fact tone={stats.activeBonuses ? "warn" : undefined}>{t("cat.active", { n: stats.activeBonuses })}</Fact>
          )}
          {(kind !== "gift_card" || stats.postedThisYear > 0) && (
            <Fact tone={stats.postedThisYear ? "money" : undefined}>{t("cat.posted", { n: stats.postedThisYear })}</Fact>
          )}
          {isCard && <Fact>{t("cat.fees", { v: fmtUsd(stats.annualFees ?? 0) })}</Fact>}
          {kind === "gift_card" && stats.faceValue ? <Fact>{t("cat.giftFace", { v: fmtUsd(stats.faceValue) })}</Fact> : null}
          {kind === "gift_card" && stats.saved ? <Fact tone="money">{t("cat.giftSaved", { v: fmtUsd(stats.saved) })}</Fact> : null}
          {kind === "gift_card" && stats.avgDiscount ? <Fact>{t("cat.giftAvg", { pct: Math.round(stats.avgDiscount * 100) })}</Fact> : null}
        </ul>
      )}
      {isCard && stats.total > 0 && (
        <div className="mt-4 border-t border-line pt-4">
          <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="text-sm font-semibold">{t("dash.five24")}</h3>
            <p className="tabular text-xl font-semibold">
              {data.five24.count}
              <span className="text-sm font-medium text-muted">/24</span>
            </p>
            <p className={cx("text-sm font-medium", data.five24.under ? "text-money" : "text-warn")}>
              {data.five24.under ? t("dash.five24.room", { n: 4 - data.five24.count }) : t("dash.five24.full", { date: data.five24.eligibleFrom ?? "—" })}
            </p>
          </div>
          <Five24Meter s={data.five24} compact />
        </div>
      )}
    </section>
  );
}
