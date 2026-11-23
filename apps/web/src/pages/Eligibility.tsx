import { useMemo, useState } from "react";
import { ProductSelect } from "../components/AccountForm";
import { Badge, Card, IssuerChip, ErrorText, Field, Input, Spinner, type Tone } from "../components/ui";
import { ruleMessage, t, td } from "../i18n";
import { cx, todayIso } from "../lib/format";
import { useEligibility, useEligibilityOverview, useProducts } from "../lib/queries";
import { useRouter } from "../lib/router";

const statusTone: Record<string, Tone> = { eligible: "green", blocked: "red", uncertain: "amber" };
/** Outcome glyphs: shape + colour, never colour alone. */
const outcomeMark: Record<string, { glyph: string; cls: string; label: string }> = {
  pass: { glyph: "✓", cls: "bg-money-soft text-money", label: "通过" },
  block: { glyph: "✕", cls: "bg-danger-soft text-danger", label: "阻止" },
  uncertain: { glyph: "?", cls: "bg-warn-soft text-warn", label: "不确定" },
  info: { glyph: "i", cls: "bg-brand-soft text-brand", label: "提示" },
};

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
                <p className="mt-1 text-sm text-muted">
                  {result.data.eligibleFrom ? t("elig.eligibleFrom", { date: result.data.eligibleFrom }) : t("elig.noDate")}
                </p>
              )}
              <h3 className="mt-4 mb-2 text-xs font-semibold text-muted">{t("elig.reasons")}</h3>
              <ul className="space-y-2">
                {result.data.reasons.map((r, i) => (
                  <li key={i} className="flex gap-2.5 text-sm">
                    <span
                      className={cx("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs font-bold", outcomeMark[r.outcome]?.cls)}
                      role="img"
                      aria-label={outcomeMark[r.outcome]?.label}
                    >
                      {outcomeMark[r.outcome]?.glyph}
                    </span>
                    <span>
                      {ruleMessage(r)}
                      {r.eligibleFrom && <span className="tabular ml-1 text-xs text-muted">({r.eligibleFrom})</span>}
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
          <ul className="divide-y divide-line">
            {(overview.data ?? []).map((r) => (
              <li key={r.productId}>
                <button
                  className={cx("-mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center justify-between gap-2 rounded-[var(--radius-row)] px-2 py-2 text-left text-sm hover:bg-sunken", productId === r.productId && "font-semibold")}
                  onClick={() => setProduct(r.productId)}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <IssuerChip issuer={r.issuer} size="sm" />
                    <span className="truncate">{r.productName}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {r.eligibleFrom && <span className="tabular text-xs text-muted">{r.eligibleFrom}</span>}
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
