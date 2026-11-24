import { useState, type FormEvent } from "react";
import { t } from "../i18n";
import { api } from "../lib/api";
import { cx, todayIso } from "../lib/format";
import { useAccounts, useMutate } from "../lib/queries";
import type { Benefit, HotelCertificate } from "../lib/types";
import { Badge, Button, ErrorText, Field, Input, Select, Sheet } from "./ui";

export function HotelCertificateList({ rows }: { rows: HotelCertificate[] }) {
  const [editing, setEditing] = useState<HotelCertificate | null>(null);
  const markUsed = useMutate((id: string) => api.post(`/hotel-certificates/${id}/use`, { usedAt: todayIso() }));
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
      {rows.map((c) => {
        const urgent = c.status === "unused" && c.daysUntilExpiration <= 60;
        return (
          <div key={c.id} className={cx("rounded-[var(--radius-row)] border p-3", urgent ? "border-warn bg-warn-soft" : "border-line bg-surface")}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium">{c.name}</p>
                <p className="text-sm text-muted">{c.hotelProgram}</p>
                <p className="text-xs text-muted">{c.accountLabel}</p>
              </div>
              <Badge tone={c.status === "unused" ? (urgent ? "amber" : "indigo") : c.status === "used" ? "green" : "slate"}>
                {t(`certificate.status.${c.status}`)}
              </Badge>
            </div>
            <p className={cx("tabular mt-3 text-sm font-medium", urgent && "text-warn")}>
              {t("certificate.expires", { date: c.expiresOn })}
              {c.status === "unused" && c.daysUntilExpiration >= 0 && <> · {t("certificate.daysLeft", { n: c.daysUntilExpiration })}</>}
            </p>
            {c.usedAt && <p className="text-xs text-muted">{t("certificate.usedOn", { date: c.usedAt })}</p>}
            {c.notes && <p className="mt-1 text-xs text-muted">{c.notes}</p>}
            <div className="mt-3 flex gap-1">
              {c.status === "unused" && <Button size="sm" onClick={() => markUsed.mutate(c.id)}>{t("detail.markUsed")}</Button>}
              <Button size="sm" variant="ghost" onClick={() => setEditing(c)}>{t("common.edit")}</Button>
            </div>
          </div>
        );
      })}
      <Sheet open={!!editing} onClose={() => setEditing(null)} title={t("certificate.edit")}>
        {editing && <HotelCertificateForm initial={editing} onDone={() => setEditing(null)} />}
      </Sheet>
    </div>
  );
}

export function HotelCertificateForm({ initial, sourceBenefit, defaultAccountId, onDone }: {
  initial?: HotelCertificate;
  sourceBenefit?: Benefit;
  defaultAccountId?: string;
  onDone: () => void;
}) {
  const { data: accounts = [] } = useAccounts();
  const [f, setF] = useState({
    accountId: initial?.accountId ?? sourceBenefit?.accountId ?? defaultAccountId ?? "",
    benefitId: initial?.benefitId ?? sourceBenefit?.id ?? null,
    name: initial?.name ?? sourceBenefit?.name ?? "Free night certificate",
    hotelProgram: initial?.hotelProgram ?? "",
    expiresOn: initial?.expiresOn ?? "",
    usedAt: initial?.usedAt ?? "",
    notes: initial?.notes ?? "",
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = useMutate(() => {
    const body = { benefitId: f.benefitId, name: f.name.trim(), hotelProgram: f.hotelProgram.trim(), expiresOn: f.expiresOn, usedAt: f.usedAt || null, notes: f.notes.trim() || null };
    return initial ? api.patch(`/hotel-certificates/${initial.id}`, body) : api.post(`/accounts/${f.accountId}/hotel-certificates`, body);
  });
  const del = useMutate(() => api.del(`/hotel-certificates/${initial!.id}`));
  const submit = (e: FormEvent) => { e.preventDefault(); save.mutate(undefined, { onSuccess: onDone }); };
  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-3">
      <Field label={t("certificate.account")} className="col-span-2">
        <Select value={f.accountId} onChange={set("accountId")} required disabled={!!initial || !!sourceBenefit}>
          <option value="">{t("acct.productPlaceholder")}</option>
          {accounts.filter((a) => a.kind === "credit_card").map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </Select>
      </Field>
      <Field label={t("certificate.name")} className="col-span-2"><Input value={f.name} onChange={set("name")} required /></Field>
      <Field label={t("certificate.program")}><Input value={f.hotelProgram} onChange={set("hotelProgram")} required placeholder="e.g. Marriott Bonvoy" /></Field>
      <Field label={t("certificate.expiresOn")}><Input type="date" value={f.expiresOn} onChange={set("expiresOn")} required /></Field>
      {initial && <Field label={t("certificate.usedAt")}><Input type="date" value={f.usedAt} onChange={set("usedAt")} /></Field>}
      <Field label={t("acct.notes")} className="col-span-2"><Input value={f.notes} onChange={set("notes")} /></Field>
      {sourceBenefit && <p className="col-span-2 text-xs text-muted">{t("certificate.fromBenefit", { name: sourceBenefit.name })}</p>}
      <div className="col-span-2"><ErrorText error={save.error ?? del.error} /></div>
      <div className="col-span-2 flex justify-between">
        {initial ? <Button type="button" variant="danger" onClick={() => confirm(t("common.confirmDelete")) && del.mutate(undefined, { onSuccess: onDone })}>{t("common.delete")}</Button> : <span />}
        <Button type="submit" variant="primary" disabled={save.isPending}>{t("common.save")}</Button>
      </div>
    </form>
  );
}
