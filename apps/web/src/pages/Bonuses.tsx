import type { AccountKind } from "@bonus/core";
import { useMemo, useState, type ReactNode } from "react";
import { BonusProgress } from "../components/BonusRow";
import { KindFilter } from "../components/KindFilter";
import { RewardTotals, sumByUnit } from "../components/RewardTotals";
import { Empty, ErrorText, IssuerChip, Spinner } from "../components/ui";
import { t, td } from "../i18n";
import { cx, fmtNum, fmtUsd } from "../lib/format";
import { useBonuses } from "../lib/queries";
import { Link } from "../lib/router";
import type { UpcomingBonus } from "../lib/types";

export function BonusesPage() {
  const { data = [], isLoading, error } = useBonuses();
  const [kind, setKind] = useState<AccountKind | "">("");
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: data.length };
    for (const b of data) c[b.kind] = (c[b.kind] ?? 0) + 1;
    return c;
  }, [data]);
  if (isLoading) return <Spinner />;
  if (error) return <ErrorText error={error} />;

  const rows = data.filter((b) => !kind || b.kind === kind);
  const groups: { key: string; title: string; items: UpcomingBonus[] }[] = [
    { key: "active", title: t("bonuses.active"), items: rows.filter((b) => b.status === "in_progress") },
    { key: "met", title: t("bonuses.met"), items: rows.filter((b) => b.status === "met") },
    { key: "posted", title: t("bonuses.posted"), items: rows.filter((b) => b.status === "posted") },
    { key: "closed", title: t("bonuses.closed"), items: rows.filter((b) => b.status === "failed" || b.status === "cancelled") },
  ];

  return (
    <div className="space-y-4 lg:space-y-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <h1 className="hidden text-2xl font-semibold tracking-tight lg:block">{t("bonuses.title")}</h1>
        <KindFilter value={kind} onChange={setKind} counts={counts} />
      </header>
      {rows.length === 0 ? (
        <Empty>{t("bonuses.empty")}</Empty>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 lg:gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="space-y-4 lg:space-y-6">
            <Group title={groups[0]!.title} count={groups[0]!.items.length} aside={<RewardTotals totals={sumByUnit(groups[0]!.items)} size="sm" />}>
              {groups[0]!.items.map((b) => (
                <BonusItem key={b.id} b={b} />
              ))}
            </Group>
            {groups[1]!.items.length > 0 && (
              <Group title={groups[1]!.title} count={groups[1]!.items.length}>
                {groups[1]!.items.map((b) => (
                  <BonusItem key={b.id} b={b} />
                ))}
              </Group>
            )}
          </div>
          <div className="space-y-4 lg:space-y-6">
            <Group title={groups[2]!.title} count={groups[2]!.items.length} aside={<RewardTotals totals={sumByUnit(groups[2]!.items)} size="sm" />}>
              {groups[2]!.items.map((b) => (
                <PostedItem key={b.id} b={b} />
              ))}
            </Group>
            {groups[3]!.items.length > 0 && (
              <Group title={groups[3]!.title} count={groups[3]!.items.length}>
                {groups[3]!.items.map((b) => (
                  <PostedItem key={b.id} b={b} />
                ))}
              </Group>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Group({ title, count, aside, children }: { title: string; count: number; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-[var(--radius-panel)] border border-line bg-surface p-4 sm:p-5">
      <div className="mb-2 flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold">
          {title} <span className="tabular ml-1 text-muted">{count}</span>
        </h2>
        {aside}
      </div>
      {count === 0 ? <p className="py-4 text-sm text-muted">{t("common.none")}</p> : <ul className="divide-y divide-line">{children}</ul>}
    </section>
  );
}

function Owner({ b }: { b: UpcomingBonus }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <IssuerChip issuer={b.institutionId} size="sm" />
      <span className="truncate text-sm font-medium">{b.accountLabel}</span>
      <span className="shrink-0 text-xs text-faint">{td(`kind.${b.kind}`)}</span>
    </span>
  );
}

function BonusItem({ b }: { b: UpcomingBonus }) {
  return (
    <li>
      <Link to={`/accounts/${b.accountId}`} className="-mx-2 block space-y-1.5 rounded-[var(--radius-row)] px-2 py-3 hover:bg-sunken">
        <Owner b={b} />
        <BonusProgress b={b} title={b.description ?? undefined} />
      </Link>
    </li>
  );
}

function PostedItem({ b }: { b: UpcomingBonus }) {
  const done = b.status === "posted";
  return (
    <li>
      <Link to={`/accounts/${b.accountId}`} className="-mx-2 flex items-center justify-between gap-3 rounded-[var(--radius-row)] px-2 py-2.5 hover:bg-sunken">
        <div className="min-w-0">
          <Owner b={b} />
          <p className="tabular mt-0.5 text-xs text-muted">{done && b.earnedAt ? t("bonuses.earnedOn", { date: b.earnedAt }) : td(`bonusStatus.${b.status}`)}</p>
        </div>
        {b.rewardAmount !== null && (
          <span className={cx("tabular shrink-0 text-sm font-semibold", done ? "text-money" : "text-faint line-through")}>
            {b.rewardUnit === "USD" ? fmtUsd(b.rewardAmount) : `${fmtNum(b.rewardAmount)} ${td(`unit.${b.rewardUnit}`)}`}
          </span>
        )}
      </Link>
    </li>
  );
}
