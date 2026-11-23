import { ACCOUNT_STATUSES } from "@bonus/core";
import { useEffect, useMemo, useState } from "react";
import { AccountDetailView } from "../components/AccountDetail";
import { AccountForm } from "../components/AccountForm";
import { daysLabel } from "../components/BonusRow";
import { IconPlus } from "../components/icons";
import { Badge, Button, Empty, ErrorText, Input, ProgressBar, Select, Sheet, Spinner, statusTone } from "../components/ui";
import { t, td, type MessageKey } from "../i18n";
import { cx, fmtUsd } from "../lib/format";
import { useAccounts } from "../lib/queries";
import { useRouter } from "../lib/router";
import type { AccountSummary } from "../lib/types";

type SortKey = "name" | "issuer" | "status" | "opened" | "fee" | "bonus" | "benefits";
const COLS: { key: SortKey; label: MessageKey; className?: string }[] = [
  { key: "name", label: "acct.col.name" },
  { key: "issuer", label: "acct.col.issuer", className: "hidden 2xl:table-cell" },
  { key: "status", label: "acct.col.status" },
  { key: "opened", label: "acct.col.opened", className: "whitespace-nowrap" },
  { key: "fee", label: "acct.col.fee", className: "text-right" },
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

export function AccountsPage() {
  const { path, navigate } = useRouter();
  const selectedId = path.startsWith("/accounts/") ? decodeURIComponent(path.slice("/accounts/".length)) : null;
  const { data = [], isLoading, error } = useAccounts();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [issuer, setIssuer] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "opened", dir: -1 });
  const [creating, setCreating] = useState(false);
  const wide = useIsWide();

  const issuers = useMemo(() => [...new Map(data.filter((a) => a.institutionId).map((a) => [a.institutionId!, a.institutionName ?? a.institutionId!])).entries()], [data]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data
      .filter((a) => !status || a.status === status)
      .filter((a) => !issuer || a.institutionId === issuer)
      .filter((a) => !needle || [a.label, a.productName, a.institutionName, a.last4, a.notes].some((s) => s?.toLowerCase().includes(needle)))
      .sort((x, y) => {
        const a = sortValue(x, sort.key);
        const b = sortValue(y, sort.key);
        return (a < b ? -1 : a > b ? 1 : 0) * sort.dir;
      });
  }, [data, q, status, issuer, sort]);

  const select = (id: string | null) => navigate(id ? `/accounts/${id}` : "/accounts", { replace: wide });

  const toolbar = (
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
      <Button variant="primary" onClick={() => setCreating(true)} className="sm:ml-auto">
        <IconPlus /> <span className="hidden sm:inline">{t("acct.new")}</span>
      </Button>
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
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-900 dark:ring-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-800/60">
                <tr>
                  {COLS.map((c) => (
                    <th key={c.key} className={cx("whitespace-nowrap px-3 py-2.5 font-medium", c.className)}>
                      <button
                        className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white"
                        onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? (-s.dir as 1 | -1) : 1 }))}
                      >
                        {t(c.label)}
                        {sort.key === c.key && <span>{sort.dir === 1 ? "▲" : "▼"}</span>}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((a) => (
                  <tr
                    key={a.id}
                    onClick={() => select(a.id)}
                    className={cx("cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-800/50", selectedId === a.id && "bg-indigo-50/60 dark:bg-indigo-950/40")}
                  >
                    <td className="px-3 py-2.5">
                      <p className="font-medium">{a.nickname || a.productName}</p>
                      <p className="text-xs text-slate-500">
                        <span className="2xl:hidden">{a.institutionName} </span>
                        {a.last4 ? `···${a.last4}` : ""} {a.ownerType === "business" ? td("ownerType.business") : ""} {a.isAuthorizedUser ? "AU" : ""}
                      </p>
                    </td>
                    <td className="hidden px-3 py-2.5 text-slate-600 dark:text-slate-300 2xl:table-cell">{a.institutionName}</td>
                    <td className="px-3 py-2.5">
                      <Badge tone={statusTone(a.status)}>{td(`status.${a.status}`)}</Badge>
                    </td>
                    <td className="tabular whitespace-nowrap px-3 py-2.5 text-slate-600 dark:text-slate-300">{a.openedAt ?? "—"}</td>
                    <td className="tabular px-3 py-2.5 text-right">{fmtUsd(a.annualFee)}</td>
                    <td className="w-40 px-3 py-2.5">
                      {a.activeBonus ? (
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-slate-500">
                            <span>{Math.round(a.activeBonus.ratio * 100)}%</span>
                            <span>{daysLabel(a.activeBonus)}</span>
                          </div>
                          <ProgressBar ratio={a.activeBonus.ratio} tone={a.activeBonus.daysLeft !== null && a.activeBonus.daysLeft <= 14 ? "amber" : "indigo"} />
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">{a.unusedBenefits > 0 ? <Badge tone="amber">{a.unusedBenefits}</Badge> : <span className="text-slate-400">0</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <ul className="space-y-2">
            {rows.map((a) => (
              <li key={a.id}>
                <button onClick={() => select(a.id)} className="w-full rounded-2xl bg-white p-4 text-left shadow-sm ring-1 ring-slate-200/70 active:bg-slate-50 dark:bg-slate-900 dark:ring-slate-800">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{a.nickname || a.productName}</p>
                      <p className="text-xs text-slate-500">
                        {a.institutionName} {a.last4 ? `· ···${a.last4}` : ""} {a.openedAt ? `· ${a.openedAt}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {a.unusedBenefits > 0 && <Badge tone="amber">🎁 {a.unusedBenefits}</Badge>}
                      <Badge tone={statusTone(a.status)}>{td(`status.${a.status}`)}</Badge>
                    </div>
                  </div>
                  {a.activeBonus && (
                    <div className="mt-3 space-y-1">
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>
                          {fmtUsd(a.activeBonus.progress)} / {fmtUsd(a.activeBonus.amountRequired)}
                        </span>
                        <span>{daysLabel(a.activeBonus)}</span>
                      </div>
                      <ProgressBar ratio={a.activeBonus.ratio} />
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
        <aside className="sticky top-6 hidden max-h-[calc(100dvh-3rem)] w-[420px] shrink-0 overflow-y-auto rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-900 dark:ring-slate-800 lg:block xl:w-[480px]">
          {selectedId ? <AccountDetailView key={selectedId} id={selectedId} onDeleted={() => select(null)} /> : <Empty>{t("acct.select")}</Empty>}
        </aside>
      )}

      {/* Phone: detail as bottom sheet */}
      {!wide && (
        <Sheet open={!!selectedId} onClose={() => navigate("/accounts")} title={data.find((a) => a.id === selectedId)?.label ?? ""}>
          {selectedId && <AccountDetailView key={selectedId} id={selectedId} onDeleted={() => navigate("/accounts")} />}
        </Sheet>
      )}

      <Sheet open={creating} onClose={() => setCreating(false)} title={t("acct.new")} wide>
        {creating && (
          <AccountForm
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
