import { ACCOUNT_KINDS, ACCOUNT_STATUSES, OWNER_TYPES, type AccountKind } from "@bonus/core";
import { useMemo, useState, type FormEvent } from "react";
import { t, td } from "../i18n";
import { api } from "../lib/api";
import { institutionMessageKey, institutionsForAccountKind } from "../lib/accountForm";
import { useInstitutions, useMutate, useProducts } from "../lib/queries";
import { cx } from "../lib/format";
import { KIND_META } from "../lib/kinds";
import { KindIcon } from "./KindIcon";
import type { AccountSummary, Product } from "../lib/types";
import { Button, ErrorText, Field, Input, Select, Textarea } from "./ui";

const CUSTOM = "__custom__";
export const NEW_PRODUCT = "__new_product__";

export function ProductSelect({ value, onChange, products, allowCustom, allowNew, required }: { value: string; onChange: (v: string) => void; products: Product[]; allowCustom?: boolean; allowNew?: boolean; required?: boolean }) {
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
      {allowNew && <option value={NEW_PRODUCT}>{t("acct.newProduct")}</option>}
      {allowCustom && <option value={CUSTOM}>{t("acct.customProduct")}</option>}
    </Select>
  );
}

const NEW_INST = "__new__";

export function AccountForm({ initial, onDone, defaultKind = "credit_card" }: { initial?: AccountSummary; onDone: (id?: string) => void; defaultKind?: AccountKind }) {
  const { data: products = [] } = useProducts();
  const { data: institutions = [] } = useInstitutions();
  const [f, setF] = useState(() => ({
    kind: (initial?.kind ?? defaultKind) as AccountKind,
    productId: initial ? (initial.productId ?? CUSTOM) : "",
    institutionId: initial?.institutionId ?? "",
    newInstitution: "",
    newProductName: "",
    newProductFee: "",
    nickname: initial?.nickname ?? "",
    last4: initial?.last4 ?? "",
    ownerType: initial?.ownerType ?? "",
    status: initial?.status ?? "open",
    appliedAt: initial?.appliedAt ?? "",
    openedAt: initial?.openedAt ?? "",
    closedAt: initial?.closedAt ?? "",
    isAuthorizedUser: initial?.isAuthorizedUser ?? false,
    notes: initial?.notes ?? "",
    accountType: (initial?.details?.accountType as string) ?? "checking",
    faceValue: initial?.details?.faceValue !== undefined ? String(initial.details.faceValue) : "",
    purchasePrice: initial?.details?.purchasePrice !== undefined ? String(initial.details.purchasePrice) : "",
  }));
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const meta = KIND_META[f.kind];
  const kindProducts = products.filter((p) => p.kind === f.kind);
  const kindInstitutions = institutionsForAccountKind(institutions, f.kind);
  // Kinds without catalog products (bank accounts, gift cards) pick an institution directly.
  const usesCatalog = meta.hasCatalog || kindProducts.length > 0;
  const newProduct = usesCatalog && f.productId === NEW_PRODUCT;
  // Institution picker is shown for "no product" accounts and when creating a product inline.
  const custom = !usesCatalog || f.productId === CUSTOM;
  const needsInstitution = custom || newProduct;
  const face = Number(f.faceValue);
  const price = Number(f.purchasePrice);
  const discount = f.kind === "gift_card" && face > 0 && price > 0 && price < face ? Math.round(((face - price) / face) * 100) : null;

  const save = useMutate(async () => {
    let institutionId = needsInstitution ? f.institutionId || null : null;
    if (needsInstitution && f.institutionId === NEW_INST) {
      const type = f.kind === "bank_account" ? "bank" : f.kind === "gift_card" ? "merchant" : "issuer";
      const inst = await api.post<{ id: string }>("/institutions", { name: f.newInstitution.trim(), type });
      institutionId = inst.id;
    }
    let productId = custom ? null : f.productId || null;
    if (newProduct) {
      const p = await api.post<{ id: string }>("/products", {
        institutionId,
        name: f.newProductName.trim(),
        kind: f.kind,
        ownerType: f.ownerType || "personal",
        annualFee: Number(f.newProductFee || 0),
      });
      productId = p.id;
      institutionId = null;
    }
    const details: Record<string, unknown> = { ...(initial?.details ?? {}) };
    if (f.kind === "bank_account") details.accountType = f.accountType;
    if (f.kind === "gift_card") {
      details.faceValue = f.faceValue === "" ? undefined : Number(f.faceValue);
      details.purchasePrice = f.purchasePrice === "" ? undefined : Number(f.purchasePrice);
    }
    const body = {
      kind: f.kind,
      productId,
      institutionId: productId ? null : institutionId,
      nickname: f.nickname || null,
      last4: f.last4 || null,
      ownerType: f.ownerType || undefined,
      status: f.status,
      appliedAt: f.appliedAt || null,
      openedAt: f.openedAt || null,
      closedAt: f.closedAt || null,
      isAuthorizedUser: meta.hasAU ? f.isAuthorizedUser : false,
      details,
      notes: f.notes || null,
    };
    return initial ? api.patch<{ id: string }>(`/accounts/${initial.id}`, body) : api.post<{ id: string }>("/accounts", body);
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(undefined, { onSuccess: (r) => onDone(r.id) });
  };
  const gift = f.kind === "gift_card";

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <fieldset className="sm:col-span-2" disabled={!!initial}>
        <legend className="mb-1 block text-sm font-medium text-muted">{t("acct.kind")}</legend>
        <div className="grid grid-cols-3 gap-2">
          {ACCOUNT_KINDS.map((k) => (
            <button
              type="button"
              key={k}
              aria-pressed={f.kind === k}
              onClick={() => setF((s) => ({ ...s, kind: k, productId: "", institutionId: "" }))}
              className={cx(
                "flex min-h-12 flex-col items-center justify-center gap-1 rounded-[var(--radius-control)] px-2 py-2 text-sm font-medium ring-1 ring-inset transition-colors duration-150 disabled:opacity-60",
                f.kind === k ? "bg-brand-soft text-brand ring-brand" : "bg-surface text-muted ring-line hover:text-ink",
              )}
            >
              <KindIcon kind={k} />
              {td(`kind.${k}`)}
            </button>
          ))}
        </div>
      </fieldset>

      {usesCatalog && (
        <Field label={t("acct.product")} className="sm:col-span-2">
          <ProductSelect value={f.productId} onChange={(v) => setF((s) => ({ ...s, productId: v }))} products={kindProducts} allowCustom allowNew required />
        </Field>
      )}
      {newProduct && (
        <>
          <Field label={t("acct.newProductName")} hint={t("acct.newProductHint")}>
            <Input value={f.newProductName} onChange={set("newProductName")} required autoFocus />
          </Field>
          <Field label={t("acct.col.fee")}>
            <Input type="number" min="0" value={f.newProductFee} onChange={set("newProductFee")} />
          </Field>
        </>
      )}
      {needsInstitution && (
        <Field label={t(institutionMessageKey(f.kind))} className={f.institutionId === NEW_INST ? "" : "sm:col-span-2"}>
          <Select value={f.institutionId} onChange={set("institutionId")} required>
            <option value="">—</option>
            {kindInstitutions.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
            <option value={NEW_INST}>{t("acct.newInstitution")}</option>
          </Select>
        </Field>
      )}
      {needsInstitution && f.institutionId === NEW_INST && (
        <Field label={t("acct.newInstitutionName")}>
          <Input value={f.newInstitution} onChange={set("newInstitution")} required autoFocus />
        </Field>
      )}

      <Field label={custom ? t("acct.name") : t("acct.nickname")}>
        <Input
          value={f.nickname}
          onChange={set("nickname")}
          placeholder={gift ? t("acct.nicknameHint.gift") : f.kind === "bank_account" ? t("acct.nicknameHint.bank") : t("common.optional")}
          required={custom}
        />
      </Field>
      <Field label={t(meta.last4 ?? "acct.last4")} hint={t(meta.last4Hint ?? "acct.last4Hint")}>
        <Input value={f.last4} onChange={set("last4")} inputMode="numeric" pattern="\d{4,5}" maxLength={5} placeholder="1234" autoComplete="off" />
      </Field>

      {f.kind === "bank_account" && (
        <Field label={t("acct.accountType")}>
          <Select value={f.accountType} onChange={set("accountType")}>
            {["checking", "savings", "brokerage", "other"].map((x) => (
              <option key={x} value={x}>
                {td(`acct.accountType.${x}`)}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {gift && (
        <>
          <Field label={t("acct.faceValue")}>
            <Input type="number" min="0" step="0.01" value={f.faceValue} onChange={set("faceValue")} />
          </Field>
          <Field label={t("acct.purchasePrice")} hint={discount !== null ? t("acct.discount", { pct: discount }) : undefined}>
            <Input type="number" min="0" step="0.01" value={f.purchasePrice} onChange={set("purchasePrice")} />
          </Field>
        </>
      )}
      {f.kind !== "gift_card" && (
        <Field label={t("acct.ownerType")}>
          <Select value={f.ownerType} onChange={set("ownerType")}>
            <option value="">{t("common.optional")}</option>
            {OWNER_TYPES.map((k) => (
              <option key={k} value={k}>
                {td(`ownerType.${k}`)}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label={t("acct.status")}>
        <Select value={f.status} onChange={set("status")}>
          {ACCOUNT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {td(`status.${s}`)}
            </option>
          ))}
        </Select>
      </Field>
      {!gift && (
        <Field label={t("acct.appliedAt")}>
          <Input type="date" value={f.appliedAt} onChange={set("appliedAt")} />
        </Field>
      )}
      <Field label={gift ? t("acct.openedAt.gift") : t("acct.openedAt")}>
        <Input type="date" value={f.openedAt} onChange={set("openedAt")} />
      </Field>
      <Field label={gift ? t("acct.closedAt.gift") : t("acct.closedAt")}>
        <Input type="date" value={f.closedAt} onChange={set("closedAt")} />
      </Field>
      {meta.hasAU && (
        <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={f.isAuthorizedUser} onChange={(e) => setF((s) => ({ ...s, isAuthorizedUser: e.target.checked }))} className="h-4 w-4 rounded" />
          {t("acct.au")}
        </label>
      )}
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
