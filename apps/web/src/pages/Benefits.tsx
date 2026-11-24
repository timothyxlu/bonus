import { useState } from "react";
import { BenefitItem } from "../components/AccountDetail";
import { HotelCertificateForm, HotelCertificateList } from "../components/HotelCertificates";
import { Button, Card, Empty, ErrorText, Sheet, Spinner } from "../components/ui";
import { t } from "../i18n";
import { useBenefits, useHotelCertificates } from "../lib/queries";
import type { Benefit } from "../lib/types";

export function BenefitsPage() {
  const { data = [], isLoading, error } = useBenefits();
  const allCertificates = useHotelCertificates();
  const unusedCertificates = useHotelCertificates("unused");
  const [unusedOnly, setUnusedOnly] = useState(true);
  const [certificateUnusedOnly, setCertificateUnusedOnly] = useState(true);
  const [addingCertificate, setAddingCertificate] = useState(false);
  const [sourceBenefit, setSourceBenefit] = useState<Benefit | undefined>();
  if (isLoading || allCertificates.isLoading || unusedCertificates.isLoading) return <Spinner />;
  if (error || allCertificates.error || unusedCertificates.error) return <ErrorText error={error ?? allCertificates.error ?? unusedCertificates.error} />;
  const certificateRows = certificateUnusedOnly ? unusedCertificates.data ?? [] : allCertificates.data ?? [];
  const rows = data.filter((b) => !unusedOnly || b.unused);
  const groups = new Map<string, typeof rows>();
  for (const b of rows) groups.set(b.accountLabel ?? "", [...(groups.get(b.accountLabel ?? "") ?? []), b]);
  return (
    <div className="space-y-4">
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{t("certificate.title")}</h1>
            <p className="text-sm text-muted">{t("certificate.subtitle")}</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <CertificateUnusedFilter
              checked={certificateUnusedOnly}
              unusedCount={unusedCertificates.data?.length ?? 0}
              totalCount={allCertificates.data?.length ?? 0}
              onChange={setCertificateUnusedOnly}
            />
            <Button onClick={() => { setSourceBenefit(undefined); setAddingCertificate(true); }}>+ {t("certificate.add")}</Button>
          </div>
        </div>
        {certificateRows.length === 0 ? <Empty>{t(certificateUnusedOnly ? "certificate.emptyUnused" : "certificate.empty")}</Empty> : <HotelCertificateList rows={certificateRows} />}
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

export function CertificateUnusedFilter({ checked, unusedCount, totalCount, onChange }: {
  checked: boolean;
  unusedCount: number;
  totalCount: number;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4" />
      {t("benefit.unusedOnly")} ({unusedCount}/{totalCount})
    </label>
  );
}
