import { ACCOUNT_STATUSES, ACCOUNT_KINDS, type AccountKind, type OwnerType } from "@bonus/core";
import { useEffect, useMemo, useState } from "react";
import { AccountDetailView } from "../components/AccountDetail";
import { AccountForm } from "../components/AccountForm";
import { daysLabel } from "../components/BonusRow";
import { KindFilter } from "../components/KindFilter";
import { OwnerTypeFilter } from "../components/OwnerTypeFilter";
import { IconGift, IconPlus } from "../components/icons";
import { Badge, Button, Empty, ErrorText, Input, IssuerChip, ProgressBar, Select, Sheet, Spinner, statusTone } from "../components/ui";
import { t, td, type MessageKey } from "../i18n";
import { cx, fmtUsd } from "../lib/format";
import { accountCreationMessageKey } from "../lib/accountForm";
import { useAccounts } from "../lib/queries";
import { useRouter } from "../lib/router";
import type { AccountSummary } from "../lib/types";

type SortKey = "name" | "issuer" | "status" | "opened" | "fee" | "bonus" | "benefits";
const COLS: { key: SortKey; label: MessageKey; className?: string }[] = [
  { key: "name", label: "acct.col.name" },
  { key: "issuer", label: "acct.col.issuer", className: "hidden 2xl:table-cell" },
  { key: "status", label: "acct.col.status" },
  { key: "opened", label: "acct.col.opened", className: "whitespace-nowrap" },
  { key: "fee", label: "acct.col.detail", className: "hidden 2xl:table-cell" },
  { key: "bonus", label: "acct.col.bonus" },
  { key: "benefits", label: "acct.col.benefits", className: "text-right" },
];

const sortValue = (a: AccountSummary, k: SortKey): string | number => {
  switch (k) {
    case "name":
      return a.label.toLowerCase();
    case "issuer":
      return (a.institutionName ?? "").toLowerCase();
    case "status":
      return a.status;
    case "opened":
      return a.openedAt ?? "";
    case "fee":
      return a.annualFee ?? -1;
    case "bonus":
      return a.activeBonus?.deadline ?? "9999";
    case "benefits":
      return a.unusedBenefits;
  }
};

function useIsWide() {
  const q = "(min-width: 1024px)";
  const [wide, setWide] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setWide(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return wide;
}

/** One short, category-specific fact for the table and list. */
function kindDetail(a: AccountSummary): string | null {
  if (a.kind === "credit_card") return a.annualFee !== null ? t("acct.annualFee", { n: a.annualFee }) : null;
  if (a.kind === "gift_card") {
    const face = Number(a.details?.faceValue);
    const price = Number(a.details?.purchasePrice);
    if (!Number.isFinite(face) || !face) return null;
    const parts = [`${fmtUsd(face)}`];
    if (Number.isFinite(price) && price && price < face) parts.push(t("acct.discount", { pct: Math.round(((face - price) / face) * 100) }));
    return parts.join("，");
  }
  if (a.kind === "bank_account" && typeof a.details?.accountType === "string") return td(`acct.accountType.${a.details.accountType}`);
  return null;
}

export function AccountsPage() {
  const { path, navigate, query } = useRouter();
  const [kind, setKind] = useState<AccountKind | "">(() => {
    const k = query.get("kind");
    return k && (ACCOUNT_KINDS as readonly string[]).includes(k) ? (k as AccountKind) : "";
  });
  const selectedId = path.startsWith("/accounts/") ? decodeURIComponent(path.slice("/accounts/".length)) : null;
  const { data = [], isLoading, error } = useAccounts();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [issuer, setIssuer] = useState("");
  const [ownerType, setOwnerType] = useState<OwnerType | "">("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "opened", dir: -1 });
  const [creating, setCreating] = useState(false);
  const wide = useIsWide();

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: data.length };
    for (const a of data) c[a.kind] = (c[a.kind] ?? 0) + 1;
    return c;
  }, [data]);
  const showBenefits = kind === "" || kind === "credit_card";
  const showBonus = kind !== "gift_card";
  const createLabel = t(accountCreationMessageKey(kind));
  // For bank accounts and gift cards the category detail (type, face value, discount) is the key fact.
  const detailCls = kind && kind !== "credit_card" ? "" : "hidden 2xl:table-cell";
  const colCls = (c: (typeof COLS)[number]) => (c.key === "fee" ? detailCls : c.className);
  const issuers = useMemo(() => [...new Map(data.filter((a) => a.institutionId && (!kind || a.kind === kind)).map((a) => [a.institutionId!, a.institutionName ?? a.institutionId!])).entries()], [data]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data
      .filter((a) => !kind || a.kind === kind)
      .filter((a) => !ownerType || a.ownerType === ownerType)
      .filter((a) => !status || a.status === status)
      .filter((a) => !issuer || a.institutionId === issuer)
      .filter((a) => !needle || [a.label, a.productName, a.institutionName, a.last4, a.notes].some((s) => s?.toLowerCase().includes(needle)))
      .sort((x, y) => {
        const a = sortValue(x, sort.key);
        const b = sortValue(y, sort.key);
        return (a < b ? -1 : a > b ? 1 : 0) * sort.dir;
      });
  }, [data, q, status, issuer, ownerType, sort, kind]);

  const select = (id: string | null) => navigate(id ? `/accounts/${id}` : "/accounts", { replace: wide });

  const toolbar = (
    <div className="space-y-2">
    <KindFilter
      value={kind}
      onChange={(k) => {
        setKind(k);
        setIssuer("");
        if (k !== "credit_card" && k !== "bank_account") setOwnerType("");
      }}
      counts={counts}
    />
    {(kind === "credit_card" || kind === "bank_account") && <OwnerTypeFilter value={ownerType} onChange={setOwnerType} />}
    <div className="flex flex-wrap items-center gap-2">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("common.search")} className="min-w-0 basis-full sm:basis-auto sm:flex-1 sm:max-w-xs" type="search" />
      <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto min-w-0 flex-1 sm:flex-none">
        <option value="">{t("acct.col.status")}: {t("common.all")}</option>
        {ACCOUNT_STATUSES.map((s) => (
          <option key={s} value={s}>
            {td(`status.${s}`)}
          </option>
        ))}
      </Select>
      <Select value={issuer} onChange={(e) => setIssuer(e.target.value)} className="w-auto min-w-0 flex-1 sm:flex-none">
        <option value="">{t("acct.col.issuer")}: {t("common.all")}</option>
        {issuers.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </Select>
      <Button variant="primary" onClick={() => setCreating(true)} className="sm:ml-auto" aria-label={createLabel}>
        <IconPlus /> <span className="hidden sm:inline">{createLabel}</span>
      </Button>
    </div>
    </div>
  );

  if (isLoading) return <Spinner />;
  if (error) return <ErrorText error={error} />;

  return (
    <div className="lg:flex lg:gap-6">
      <div className="min-w-0 flex-1 space-y-3">
        {toolbar}
        {rows.length === 0 ? (
          <Empty>{t("acct.empty")}</Empty>
        ) : wide ? (
          <div className="overflow-hidden rounded-[var(--radius-panel)] bg-surface ring-1 ring-line">
            <table className="w-full text-sm">
              <thead className="bg-sunken text-left text-xs text-muted">
                <tr>
                  {COLS.filter((c) => (c.key !== "benefits" || showBenefits) && (c.key !== "bonus" || showBonus)).map((c) => (
                    <th key={c.key} aria-sort={sort.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : undefined} className={cx("whitespace-nowrap px-3 py-2.5 font-medium", colCls(c))}>
                      <button
                        className="inline-flex items-center gap-1 hover:text-ink"
                        onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? (-s.dir as 1 | -1) : 1 }))}
                      >
                        {t(c.label)}
                        <span aria-hidden className={cx("text-[10px]", sort.key === c.key ? "text-brand" : "text-transparent")}>{sort.dir === 1 || sort.key !== c.key ? "▲" : "▼"}</span>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((a) => (
                  <tr
                    key={a.id}
                    onClick={() => select(a.id)}
                    className={cx("cursor-pointer transition-colors duration-150 hover:bg-sunken", selectedId === a.id && "bg-brand-soft hover:bg-brand-soft", a.status !== "open" && "text-muted")}
                  >
                    <td className="min-w-60 px-3 py-2.5">
                      <div className="flex items-center gap-3">
                        <IssuerChip issuer={a.institutionId} closed={a.status !== "open"} />
                        <div className="min-w-0">
                          <button
                            className="text-left font-medium text-ink focus-visible:underline"
                            aria-current={selectedId === a.id ? "true" : undefined}
                            onClick={(e) => {
                              e.stopPropagation();
                              select(a.id);
                            }}
                          >
                            {a.nickname || a.productName}
                          </button>
                          <p className="flex gap-x-2 truncate text-xs whitespace-nowrap text-muted">
                            <span className="2xl:hidden">{a.institutionName}</span>
                            {a.last4 && <span className="tabular">尾号 {a.last4}</span>}
                            {!kind && <span>{td(`kind.${a.kind}`)}</span>}
                            {a.ownerType === "business" && <span>{td("ownerType.business")}</span>}
                            {a.isAuthorizedUser && <span>AU</span>}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="hidden px-3 py-2.5 text-muted 2xl:table-cell">{a.institutionName}</td>
                    <td className="px-3 py-2.5">
                      <Badge tone={statusTone(a.status)}>{td(`status.${a.status}`)}</Badge>
                    </td>
                    <td className="tabular whitespace-nowrap px-3 py-2.5 text-muted">{a.openedAt ?? "—"}</td>
                    <td className={cx("tabular px-3 py-2.5 whitespace-nowrap text-muted", detailCls)}>{kindDetail(a) ?? "—"}</td>
                    {showBonus && <td className="w-40 px-3 py-2.5">
                      {a.activeBonus ? (
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-muted">
                            <span>{Math.round(a.activeBonus.ratio * 100)}%</span>
                            <span>{daysLabel(a.activeBonus)}</span>
                          </div>
                          <ProgressBar ratio={a.activeBonus.ratio} tone={a.activeBonus.daysLeft !== null && a.activeBonus.daysLeft <= 14 ? "amber" : "indigo"} />
                        </div>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </td>}
                    {showBenefits && <td className="px-3 py-2.5 text-right">{a.kind !== "credit_card" ? <span className="text-faint">—</span> : a.unusedBenefits > 0 ? <Badge tone="amber"><IconGift small />{a.unusedBenefits}</Badge> : <span className="text-faint">0</span>}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <ul className="space-y-2">
            {rows.map((a) => (
              <li key={a.id}>
                <button onClick={() => select(a.id)} className="w-full rounded-[var(--radius-panel)] border border-line bg-surface p-4 text-left transition-colors duration-150 active:bg-sunken">
                  <div className="flex items-start gap-3">
                    <IssuerChip issuer={a.institutionId} closed={a.status !== "open"} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{a.nickname || a.productName}</p>
                      <p className="flex flex-wrap gap-x-2 text-xs text-muted">
                        <span>{a.institutionName}</span>
                        {a.last4 && <span className="tabular">尾号 {a.last4}</span>}
                        {a.openedAt && <span className="tabular">{a.openedAt}</span>}
                        {kindDetail(a) && <span>{kindDetail(a)}</span>}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge tone={statusTone(a.status)}>{td(`status.${a.status}`)}</Badge>
                      {a.unusedBenefits > 0 && (
                        <Badge tone="amber">
                          <IconGift small />
                          {a.unusedBenefits}
                        </Badge>
                      )}
                    </div>
                  </div>
                  {a.activeBonus && (
                    <div className="mt-3 space-y-1">
                      <div className="flex justify-between text-xs text-muted">
                        <span>
                          {fmtUsd(a.activeBonus.progress)} / {fmtUsd(a.activeBonus.amountRequired)}
                        </span>
                        <span>{daysLabel(a.activeBonus)}</span>
                      </div>
                      <ProgressBar ratio={a.activeBonus.ratio} tone={a.activeBonus.daysLeft !== null && a.activeBonus.daysLeft <= 14 ? "amber" : "indigo"} />
                    </div>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Wide: right detail panel */}
      {wide && (
        <aside className="sticky top-6 hidden max-h-[calc(100dvh-3rem)] w-[420px] shrink-0 overflow-y-auto rounded-[var(--radius-panel)] border border-line bg-surface p-5 lg:block xl:w-[480px]">
          {selectedId ? <AccountDetailView key={selectedId} id={selectedId} onDeleted={() => select(null)} /> : <Empty>{t("acct.select")}</Empty>}
        </aside>
      )}

      {/* Phone: detail as bottom sheet */}
      {!wide && (
        <Sheet open={!!selectedId} onClose={() => navigate("/accounts")} title={data.find((a) => a.id === selectedId)?.label ?? ""}>
          {selectedId && <AccountDetailView key={selectedId} id={selectedId} onDeleted={() => navigate("/accounts")} />}
        </Sheet>
      )}

      <Sheet open={creating} onClose={() => setCreating(false)} title={createLabel} wide>
        {creating && (
          <AccountForm
            defaultKind={kind || "credit_card"}
            onDone={(id) => {
              setCreating(false);
              if (id) select(id);
            }}
          />
        )}
      </Sheet>
    </div>
  );
}
