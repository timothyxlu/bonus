import { ACCOUNT_KINDS, ACCOUNT_STATUSES, OWNER_TYPES } from "@bonus/core";
import { useMemo, useState, type FormEvent } from "react";
import { t, td } from "../i18n";
import { api } from "../lib/api";
import { useInstitutions, useMutate, useProducts } from "../lib/queries";
import type { AccountSummary, Product } from "../lib/types";
import { Button, ErrorText, Field, Input, Select, Textarea } from "./ui";

const CUSTOM = "__custom__";

export function ProductSelect({ value, onChange, products, allowCustom, required }: { value: string; onChange: (v: string) => void; products: Product[]; allowCustom?: boolean; required?: boolean }) {
  const groups = useMemo(() => {
    const m = new Map<string, Product[]>();
    for (const p of products) m.set(p.institutionName, [...(m.get(p.institutionName) ?? []), p]);
    return [...m.entries()];
  }, [products]);
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} required={required}>
      <option value="">{t("acct.productPlaceholder")}</option>
      {groups.map(([inst, ps]) => (
        <optgroup key={inst} label={inst}>
          {ps.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.ownerType === "business" ? ` (${t("ownerType.business")})` : ""}
            </option>
          ))}
        </optgroup>
      ))}
      {allowCustom && <option value={CUSTOM}>{t("acct.customProduct")}</option>}
    </Select>
  );
}

export function AccountForm({ initial, onDone }: { initial?: AccountSummary; onDone: (id?: string) => void }) {
  const { data: products = [] } = useProducts();
  const { data: institutions = [] } = useInstitutions();
  const [f, setF] = useState(() => ({
    kind: initial?.kind ?? "credit_card",
    productId: initial ? (initial.productId ?? CUSTOM) : "",
    institutionId: initial?.institutionId ?? "",
    nickname: initial?.nickname ?? "",
    last4: initial?.last4 ?? "",
    ownerType: initial?.ownerType ?? "",
    status: initial?.status ?? "open",
    appliedAt: initial?.appliedAt ?? "",
    openedAt: initial?.openedAt ?? "",
    closedAt: initial?.closedAt ?? "",
    isAuthorizedUser: initial?.isAuthorizedUser ?? false,
    notes: initial?.notes ?? "",
  }));
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const kindProducts = products.filter((p) => p.kind === f.kind);
  const save = useMutate(async () => {
    const custom = f.productId === CUSTOM;
    const body = {
      kind: f.kind,
      productId: custom ? null : f.productId || null,
      institutionId: custom ? f.institutionId || null : null,
      nickname: f.nickname || null,
      last4: f.last4 || null,
      ownerType: f.ownerType || undefined,
      status: f.status,
      appliedAt: f.appliedAt || null,
      openedAt: f.openedAt || null,
      closedAt: f.closedAt || null,
      isAuthorizedUser: f.isAuthorizedUser,
      notes: f.notes || null,
    };
    return initial
      ? api.patch<{ id: string }>(`/accounts/${initial.id}`, body)
      : api.post<{ id: string }>("/accounts", body);
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(undefined, { onSuccess: (r) => onDone(r.id) });
  };

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label={t("acct.ownerType")} className="sm:col-span-2">
        <div className="flex gap-2">
          <Select value={f.kind} onChange={set("kind")} className="flex-1" disabled={!!initial}>
            {ACCOUNT_KINDS.map((k) => (
              <option key={k} value={k}>
                {td(`kind.${k}`)}
              </option>
            ))}
          </Select>
          <Select value={f.ownerType} onChange={set("ownerType")} className="flex-1">
            <option value="">{t("common.optional")}</option>
            {OWNER_TYPES.map((k) => (
              <option key={k} value={k}>
                {td(`ownerType.${k}`)}
              </option>
            ))}
          </Select>
        </div>
      </Field>
      <Field label={t("acct.product")} className="sm:col-span-2">
        <ProductSelect value={f.productId} onChange={(v) => setF((s) => ({ ...s, productId: v }))} products={kindProducts} allowCustom required />
      </Field>
      {f.productId === CUSTOM && (
        <Field label={t("acct.institution")} className="sm:col-span-2">
          <Select value={f.institutionId} onChange={set("institutionId")} required>
            <option value="">—</option>
            {institutions.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label={t("acct.nickname")}>
        <Input value={f.nickname} onChange={set("nickname")} placeholder={t("common.optional")} />
      </Field>
      <Field label={t("acct.last4")} hint={t("acct.last4Hint")}>
        <Input value={f.last4} onChange={set("last4")} inputMode="numeric" pattern="\d{4}" maxLength={4} placeholder="1234" autoComplete="off" />
      </Field>
      <Field label={t("acct.status")}>
        <Select value={f.status} onChange={set("status")}>
          {ACCOUNT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {td(`status.${s}`)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("acct.appliedAt")}>
        <Input type="date" value={f.appliedAt} onChange={set("appliedAt")} />
      </Field>
      <Field label={t("acct.openedAt")}>
        <Input type="date" value={f.openedAt} onChange={set("openedAt")} />
      </Field>
      <Field label={t("acct.closedAt")}>
        <Input type="date" value={f.closedAt} onChange={set("closedAt")} />
      </Field>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" checked={f.isAuthorizedUser} onChange={(e) => setF((s) => ({ ...s, isAuthorizedUser: e.target.checked }))} className="h-4 w-4 rounded" />
        {t("acct.au")}
      </label>
      <Field label={t("acct.notes")} className="sm:col-span-2">
        <Textarea rows={2} value={f.notes} onChange={set("notes")} />
      </Field>
      <div className="sm:col-span-2">
        <ErrorText error={save.error} />
      </div>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" onClick={() => onDone()}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" variant="primary" disabled={save.isPending}>
          {t("common.save")}
        </Button>
      </div>
    </form>
  );
}
