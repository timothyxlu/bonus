import { useState } from "react";
import { BenefitItem } from "../components/AccountDetail";
import { HotelCertificateForm, HotelCertificateList } from "../components/HotelCertificates";
import { Button, Card, Empty, ErrorText, Sheet, Spinner } from "../components/ui";
import { t } from "../i18n";
import { useBenefits, useHotelCertificates } from "../lib/queries";
import type { Benefit } from "../lib/types";

export function BenefitsPage() {
  const { data = [], isLoading, error } = useBenefits();
  const certificates = useHotelCertificates();
  const [unusedOnly, setUnusedOnly] = useState(true);
  const [addingCertificate, setAddingCertificate] = useState(false);
  const [sourceBenefit, setSourceBenefit] = useState<Benefit | undefined>();
  if (isLoading || certificates.isLoading) return <Spinner />;
  if (error || certificates.error) return <ErrorText error={error ?? certificates.error} />;
  const rows = data.filter((b) => !unusedOnly || b.unused);
  const groups = new Map<string, typeof rows>();
  for (const b of rows) groups.set(b.accountLabel ?? "", [...(groups.get(b.accountLabel ?? "") ?? []), b]);
  return (
    <div className="space-y-4">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">{t("certificate.title")}</h1>
            <p className="text-sm text-muted">{t("certificate.subtitle")}</p>
          </div>
          <Button onClick={() => { setSourceBenefit(undefined); setAddingCertificate(true); }}>+ {t("certificate.add")}</Button>
        </div>
        {(certificates.data?.length ?? 0) === 0 ? <Empty>{t("certificate.empty")}</Empty> : <HotelCertificateList rows={certificates.data ?? []} />}
      </section>
      <hr className="border-line" />
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{t("benefit.recurringTitle")}</h2>
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
                  <BenefitItem key={b.id} b={b} allowEdit onCreateCertificate={b.unit === "free_night" || b.unit === "certificate" ? () => { setSourceBenefit(b); setAddingCertificate(true); } : undefined} />
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
      <Sheet open={addingCertificate} onClose={() => setAddingCertificate(false)} title={t("certificate.add")}>
        {addingCertificate && <HotelCertificateForm sourceBenefit={sourceBenefit} onDone={() => setAddingCertificate(false)} />}
      </Sheet>
    </div>
  );
}
