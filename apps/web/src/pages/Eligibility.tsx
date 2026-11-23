import { useMemo, useState } from "react";
import { ProductSelect } from "../components/AccountForm";
import { Badge, Card, ErrorText, Field, Input, Spinner, type Tone } from "../components/ui";
import { ruleMessage, t, td } from "../i18n";
import { cx, todayIso } from "../lib/format";
import { useEligibility, useEligibilityOverview, useProducts } from "../lib/queries";
import { useRouter } from "../lib/router";

const statusTone: Record<string, Tone> = { eligible: "green", blocked: "red", uncertain: "amber" };
const outcomeDot: Record<string, string> = { pass: "bg-emerald-500", block: "bg-rose-500", uncertain: "bg-amber-500", info: "bg-sky-500" };

export function EligibilityPage() {
  const { query, navigate } = useRouter();
  const { data: products = [] } = useProducts();
  const productId = query.get("product") ?? "";
  const [asOf, setAsOf] = useState(query.get("asOf") ?? todayIso());
  const [countAU, setCountAU] = useState(true);
  const [precise, setPrecise] = useState(false);
  const qs = useMemo(() => new URLSearchParams({ asOf, countAU: countAU ? "1" : "0", precise: precise ? "1" : "0" }).toString(), [asOf, countAU, precise]);
  const result = useEligibility(productId || null, qs);
  const overview = useEligibilityOverview(qs);
  const cards = products.filter((p) => p.kind === "credit_card");
  const setProduct = (id: string) => navigate(`/eligibility${id ? `?product=${encodeURIComponent(id)}` : ""}`, { replace: true });

  return (
    <div className="grid grid-cols-1 gap-4 lg:gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <Card title={t("elig.title")}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
            <Field label={t("elig.product")}>
              <ProductSelect value={productId} onChange={setProduct} products={cards} />
            </Field>
            <Field label={t("elig.asOf")}>
              <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value || todayIso())} />
            </Field>
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={countAU} onChange={(e) => setCountAU(e.target.checked)} className="h-4 w-4" /> {t("elig.countAU")}
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={precise} onChange={(e) => setPrecise(e.target.checked)} className="h-4 w-4" /> {t("elig.precise")}
            </label>
          </div>
        </Card>

        {productId &&
          (result.isLoading ? (
            <Spinner />
          ) : result.error ? (
            <ErrorText error={result.error} />
          ) : result.data ? (
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">{result.data.productName}</h2>
                <Badge tone={statusTone[result.data.status]} className="!text-sm !px-3 !py-1">
                  {td(`elig.status.${result.data.status}`)}
                </Badge>
              </div>
              {result.data.status === "blocked" && (
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  {result.data.eligibleFrom ? t("elig.eligibleFrom", { date: result.data.eligibleFrom }) : t("elig.noDate")}
                </p>
              )}
              <h3 className="mt-4 mb-2 text-xs font-semibold text-slate-500">{t("elig.reasons")}</h3>
              <ul className="space-y-2">
                {result.data.reasons.map((r, i) => (
                  <li key={i} className="flex gap-2.5 text-sm">
                    <span className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", outcomeDot[r.outcome])} />
                    <span>
                      {ruleMessage(r)}
                      {r.eligibleFrom && <span className="tabular ml-1 text-xs text-slate-500">({r.eligibleFrom})</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null)}
      </div>

      <Card title={t("elig.overview")}>
        {overview.isLoading ? (
          <Spinner />
        ) : overview.error ? (
          <ErrorText error={overview.error} />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {(overview.data ?? []).map((r) => (
              <li key={r.productId}>
                <button
                  className={cx("flex w-full items-center justify-between gap-2 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50", productId === r.productId && "font-semibold")}
                  onClick={() => setProduct(r.productId)}
                >
                  <span className="min-w-0 truncate">
                    <span className="text-xs text-slate-500">{r.issuer} · </span>
                    {r.productName}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {r.eligibleFrom && <span className="tabular text-xs text-slate-500">{r.eligibleFrom}</span>}
                    <Badge tone={statusTone[r.status]}>{td(`elig.status.${r.status}`)}</Badge>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
