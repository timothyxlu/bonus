import { useState } from "react";
import { BenefitItem } from "../components/AccountDetail";
import { Card, Empty, ErrorText, Spinner } from "../components/ui";
import { t } from "../i18n";
import { useBenefits } from "../lib/queries";

export function BenefitsPage() {
  const { data = [], isLoading, error } = useBenefits();
  const [unusedOnly, setUnusedOnly] = useState(true);
  if (isLoading) return <Spinner />;
  if (error) return <ErrorText error={error} />;
  const rows = data.filter((b) => !unusedOnly || b.unused);
  const groups = new Map<string, typeof rows>();
  for (const b of rows) groups.set(b.accountLabel ?? "", [...(groups.get(b.accountLabel ?? "") ?? []), b]);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="hidden text-xl font-semibold lg:block">{t("benefit.title")}</h1>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={unusedOnly} onChange={(e) => setUnusedOnly(e.target.checked)} className="h-4 w-4" />
          {t("benefit.unusedOnly")} ({data.filter((b) => b.unused).length}/{data.length})
        </label>
      </div>
      {rows.length === 0 ? (
        <Empty>{t("benefit.empty")}</Empty>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {[...groups.entries()].map(([label, items]) => (
            <Card key={label} title={label}>
              <div className="space-y-2">
                {items.map((b) => (
                  <BenefitItem key={b.id} b={b} />
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
