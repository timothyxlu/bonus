import { ACCOUNT_KINDS, INSTITUTION_TYPES, NETWORKS, OWNER_TYPES, type AccountKind } from "@bonus/core";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { IconPlus } from "../components/icons";
import { KindIcon } from "../components/KindIcon";
import { Badge, Button, Empty, ErrorText, Field, Input, IssuerChip, Select, Sheet, Spinner } from "../components/ui";
import { t, td } from "../i18n";
import { api } from "../lib/api";
import { cx, fmtUsd } from "../lib/format";
import { useInstitutions, useMutate } from "../lib/queries";
import type { Institution, Product } from "../lib/types";

const NEW_INST = "__new__";

export function CatalogPage() {
  const [tab, setTab] = useState<"products" | "institutions">("products");
  return (
    <div className="space-y-4 lg:space-y-5">
      <header>
        <h1 className="hidden text-2xl font-semibold tracking-tight lg:block">{t("cat2.title")}</h1>
        <p className="text-sm text-muted">{t("cat2.subtitle")}</p>
      </header>
      <div role="tablist" className="inline-flex gap-1 rounded-[var(--radius-control)] bg-sunken p-1 ring-1 ring-line ring-inset">
        {(["products", "institutions"] as const).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cx(
              "min-h-10 rounded-[7px] px-4 text-sm font-medium sm:min-h-8",
              tab === k ? "bg-surface text-ink ring-1 ring-line" : "text-muted hover:text-ink",
            )}
          >
            {t(k === "products" ? "cat2.products" : "cat2.institutions")}
          </button>
        ))}
      </div>
      {tab === "products" ? <ProductsTab /> : <InstitutionsTab />}
    </div>
  );
}

// ---------------------------------------------------------------- products

function ProductsTab() {
  const [archived, setArchived] = useState(false);
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["products", "catalog", archived],
    queryFn: () => api.get<Product[]>(`/products?usage=1${archived ? "&archived=1" : ""}`),
  });
  const { data: institutions = [] } = useInstitutions();
  const [q, setQ] = useState("");
  const [inst, setInst] = useState("");
  const [kind, setKind] = useState<AccountKind | "">("");
  const [editing, setEditing] = useState<Product | "new" | null>(null);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = data.filter(
      (p) =>
        (!inst || p.institutionId === inst) &&
        (!kind || p.kind === kind) &&
        (!needle || [p.name, p.id, p.institutionName, p.family ?? "", p.currency ?? ""].some((s) => s.toLowerCase().includes(needle))),
    );
    const m = new Map<string, Product[]>();
    for (const p of rows) m.set(p.institutionId, [...(m.get(p.institutionId) ?? []), p]);
    return [...m.entries()];
  }, [data, q, inst, kind]);

  if (isLoading) return <Spinner />;
  if (error) return <ErrorText error={error} />;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("common.search")} className="min-w-0 basis-full sm:basis-auto sm:max-w-xs sm:flex-1" />
        <Select value={inst} onChange={(e) => setInst(e.target.value)} className="w-auto min-w-0 flex-1 basis-[calc(50%-0.25rem)] sm:flex-none sm:basis-auto">
          <option value="">{t("cat2.allInstitutions")}</option>
          {institutions.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </Select>
        <Select value={kind} onChange={(e) => setKind(e.target.value as AccountKind | "")} className="w-auto min-w-0 flex-1 basis-[calc(50%-0.25rem)] sm:flex-none sm:basis-auto">
          <option value="">{t("cat2.allKinds")}</option>
          {ACCOUNT_KINDS.map((k) => (
            <option key={k} value={k}>
              {td(`kind.${k}`)}
            </option>
          ))}
        </Select>
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} className="h-4 w-4" />
          {t("cat2.showArchived")}
        </label>
        <Button variant="primary" className="ml-auto" onClick={() => setEditing("new")}>
          <IconPlus /> {t("cat2.addProduct")}
        </Button>
      </div>

      {groups.length === 0 ? (
        <Empty>{t("cat2.empty")}</Empty>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
          {groups.map(([instId, ps]) => (
            <section key={instId} className="rounded-[var(--radius-panel)] border border-line bg-surface p-4 sm:p-5">
              <h2 className="mb-2 flex items-center gap-2 text-base font-semibold">
                <IssuerChip issuer={instId} size="sm" />
                {ps[0]!.institutionName}
                <span className="tabular text-sm font-normal text-muted">{ps.length}</span>
              </h2>
              <ul className="divide-y divide-line">
                {ps.map((p) => (
                  <ProductRow key={p.id} p={p} onEdit={() => setEditing(p)} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing === "new" ? t("cat2.addProduct") : t("cat2.editProduct")} wide>
        {editing && <ProductForm initial={editing === "new" ? undefined : editing} defaultInstitution={inst} onDone={() => setEditing(null)} />}
      </Sheet>
    </div>
  );
}

function RuleChips({ p }: { p: Product }) {
  const r = p.rules ?? {};
  const chips: string[] = [];
  if (r.lifetimeBonus) chips.push(t("cat2.r.lifetime"));
  if (r.familyRank !== undefined) chips.push(t("cat2.r.rank", { n: r.familyRank }));
  if (r.bonusCooldownMonths) chips.push(t("cat2.r.cooldown", { n: r.bonusCooldownMonths }));
  if (r.isCharge) chips.push(t("cat2.r.charge"));
  if (r.reportsToPersonal) chips.push(t("cat2.r.reports"));
  return (
    <>
      {chips.map((c) => (
        <Badge key={c} tone="indigo">
          {c}
        </Badge>
      ))}
    </>
  );
}

function ProductRow({ p, onEdit }: { p: Product; onEdit: () => void }) {
  const archive = useMutate(() => api.post(`/products/${p.id}/archive`, { archived: !p.archived }));
  const reset = useMutate(() => api.del(`/products/${p.id}/override`));
  return (
    <li className={cx("flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between", p.archived && "opacity-60")}>
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium">{p.name}</span>
          {!p.isCatalog && <Badge tone="green">{t("cat2.mine")}</Badge>}
          {p.customized && <Badge tone="amber">{t("cat2.edited")}</Badge>}
          {p.archived && <Badge>{t("cat2.archived")}</Badge>}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span className="inline-flex items-center gap-1">
            <KindIcon kind={p.kind} small />
            {td(`kind.${p.kind}`)}
          </span>
          <span>{td(`ownerType.${p.ownerType}`)}</span>
          {p.kind === "credit_card" && <span className="tabular">{fmtUsd(p.annualFee)}</span>}
          {p.family && <span className="font-mono text-[11px]">{p.family}</span>}
          {!!p.accountCount && <span>{t("cat2.used", { n: p.accountCount })}</span>}
          <RuleChips p={p} />
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {p.isCatalog && p.customized && (
          <Button size="sm" variant="ghost" onClick={() => confirm(t("cat2.confirmReset")) && reset.mutate(undefined)}>
            {t("cat2.reset")}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => archive.mutate(undefined)}>
          {p.archived ? t("cat2.unarchive") : t("cat2.archive")}
        </Button>
        <Button size="sm" onClick={onEdit}>
          {t("common.edit")}
        </Button>
      </div>
    </li>
  );
}

export function ProductForm({ initial, defaultInstitution = "", defaultKind = "credit_card", onDone }: { initial?: Product; defaultInstitution?: string; defaultKind?: AccountKind; onDone: (p?: Product) => void }) {
  const { data: institutions = [] } = useInstitutions();
  const r = initial?.rules ?? {};
  const s = (v: number | undefined | null) => (v === undefined || v === null ? "" : String(v));
  const [f, setF] = useState({
    id: "",
    institutionId: initial?.institutionId ?? defaultInstitution,
    newInstitution: "",
    name: initial?.name ?? "",
    kind: (initial?.kind ?? defaultKind) as AccountKind,
    ownerType: initial?.ownerType ?? "personal",
    annualFee: s(initial?.annualFee ?? 0),
    network: initial?.network ?? "",
    currency: initial?.currency ?? "",
    family: initial?.family ?? "",
    lifetimeBonus: !!r.lifetimeBonus,
    familyRank: s(r.familyRank),
    bonusCooldownMonths: s(r.bonusCooldownMonths),
    cooldownScope: r.cooldownScope ?? "product",
    isCharge: !!r.isCharge,
    reportsToPersonal: !!r.reportsToPersonal,
    currentHolderIneligible: r.currentHolderIneligible !== false,
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const check = (k: keyof typeof f) => (e: { target: { checked: boolean } }) => setF((x) => ({ ...x, [k]: e.target.checked }));
  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  const save = useMutate(async () => {
    let institutionId = f.institutionId;
    if (institutionId === NEW_INST) {
      const type = f.kind === "bank_account" ? "bank" : f.kind === "gift_card" ? "merchant" : "issuer";
      institutionId = (await api.post<{ id: string }>("/institutions", { name: f.newInstitution.trim(), type })).id;
    }
    const rules = {
      lifetimeBonus: f.lifetimeBonus || null,
      familyRank: num(f.familyRank),
      bonusCooldownMonths: num(f.bonusCooldownMonths),
      cooldownScope: num(f.bonusCooldownMonths) ? f.cooldownScope : null,
      isCharge: f.isCharge || null,
      reportsToPersonal: f.ownerType === "business" ? f.reportsToPersonal || null : null,
      currentHolderIneligible: f.currentHolderIneligible ? null : false,
    };
    const common = {
      institutionId,
      name: f.name.trim(),
      ownerType: f.ownerType,
      annualFee: Number(f.annualFee || 0),
      network: f.network || null,
      currency: f.currency.trim() || null,
      family: f.family.trim() || null,
    };
    if (initial) return api.patch<Product>(`/products/${initial.id}`, { ...common, ...(initial.kind !== f.kind ? { kind: f.kind } : {}), rules });
    const clean = Object.fromEntries(Object.entries(rules).filter(([, v]) => v !== null));
    return api.post<Product>("/products", { ...common, kind: f.kind, ...(f.id.trim() ? { id: f.id.trim() } : {}), rules: clean });
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(undefined, { onSuccess: (p) => onDone(p) });
  };
  const isCard = f.kind === "credit_card";

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label={t("acct.institution")} className={f.institutionId === NEW_INST ? "" : "sm:col-span-2"}>
        <Select value={f.institutionId} onChange={set("institutionId")} required>
          <option value="">—</option>
          {institutions.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
          <option value={NEW_INST}>{t("acct.newInstitution")}</option>
        </Select>
      </Field>
      {f.institutionId === NEW_INST && (
        <Field label={t("acct.newInstitutionName")}>
          <Input value={f.newInstitution} onChange={set("newInstitution")} required />
        </Field>
      )}
      <Field label={t("settings.productName")} className="sm:col-span-2">
        <Input value={f.name} onChange={set("name")} required />
      </Field>
      {!initial && (
        <Field label={t("cat2.id")} hint={t("cat2.idHint")} className="sm:col-span-2">
          <Input value={f.id} onChange={set("id")} pattern="[a-z0-9_\\-]{2,60}" className="font-mono" />
        </Field>
      )}
      <Field label={t("acct.kind")}>
        <Select value={f.kind} onChange={set("kind")} disabled={!!initial?.accountCount}>
          {ACCOUNT_KINDS.map((k) => (
            <option key={k} value={k}>
              {td(`kind.${k}`)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("acct.ownerType")}>
        <Select value={f.ownerType} onChange={set("ownerType")}>
          {OWNER_TYPES.map((k) => (
            <option key={k} value={k}>
              {td(`ownerType.${k}`)}
            </option>
          ))}
        </Select>
      </Field>
      {isCard && (
        <>
          <Field label={t("acct.col.fee")}>
            <Input type="number" min="0" value={f.annualFee} onChange={set("annualFee")} />
          </Field>
          <Field label={t("cat2.network")}>
            <Select value={f.network} onChange={set("network")}>
              <option value="">—</option>
              {NETWORKS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </Field>
        </>
      )}
      <Field label={t("cat2.currency")}>
        <Input value={f.currency} onChange={set("currency")} placeholder="Hilton Honors" />
      </Field>
      <Field label={t("cat2.family")} hint={t("cat2.familyHint")}>
        <Input value={f.family} onChange={set("family")} className="font-mono" />
      </Field>

      <fieldset className="space-y-3 rounded-[var(--radius-row)] border border-line p-3 sm:col-span-2">
        <legend className="px-1 text-sm font-medium text-muted">{t("cat2.rules")}</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label={t("cat2.cooldown")} hint={t("cat2.cooldownHint")}>
            <Input type="number" min="0" max="120" value={f.bonusCooldownMonths} onChange={set("bonusCooldownMonths")} />
          </Field>
          <Field label={t("cat2.cooldownScope")}>
            <Select value={f.cooldownScope} onChange={set("cooldownScope")} disabled={!f.bonusCooldownMonths}>
              <option value="product">{t("cat2.scope.product")}</option>
              <option value="family">{t("cat2.scope.family")}</option>
            </Select>
          </Field>
          <Field label={t("cat2.familyRank")} hint={t("cat2.familyRankHint")}>
            <Input type="number" min="0" max="100" value={f.familyRank} onChange={set("familyRank")} />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {(
            [
              ["lifetimeBonus", "cat2.lifetimeBonus"],
              ["currentHolderIneligible", "cat2.currentHolder"],
              ...(isCard ? [["isCharge", "cat2.isCharge"] as const] : []),
              ...(isCard && f.ownerType === "business" ? [["reportsToPersonal", "cat2.reportsToPersonal"] as const] : []),
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="flex min-h-10 items-center gap-2 text-sm">
              <input type="checkbox" checked={f[k] as boolean} onChange={check(k)} className="h-4 w-4" />
              {t(label)}
            </label>
          ))}
        </div>
      </fieldset>

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

// ---------------------------------------------------------------- institutions

function InstitutionsTab() {
  const { data = [], isLoading, error } = useInstitutions();
  const [editing, setEditing] = useState<Institution | "new" | null>(null);
  if (isLoading) return <Spinner />;
  if (error) return <ErrorText error={error} />;
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="primary" onClick={() => setEditing("new")}>
          <IconPlus /> {t("cat2.addInstitution")}
        </Button>
      </div>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {data.map((i) => (
          <InstitutionRow key={i.id} i={i} onEdit={() => setEditing(i)} />
        ))}
      </ul>
      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing === "new" ? t("cat2.addInstitution") : t("cat2.editInstitution")}>
        {editing && <InstitutionForm initial={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} />}
      </Sheet>
    </div>
  );
}

function InstitutionRow({ i, onEdit }: { i: Institution; onEdit: () => void }) {
  const reset = useMutate(() => api.del(`/institutions/${i.id}/override`));
  return (
    <li className="flex items-center justify-between gap-3 rounded-[var(--radius-row)] border border-line bg-surface p-3">
      <div className="flex min-w-0 items-center gap-3">
        <IssuerChip issuer={i.id} />
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            <span className="truncate">{i.name}</span>
            {!i.isCatalog && <Badge tone="green">{t("cat2.mine")}</Badge>}
            {i.customized && <Badge tone="amber">{t("cat2.edited")}</Badge>}
          </p>
          <p className="text-xs text-muted">
            <span className="font-mono">{i.id}</span> · {td(`cat2.instType.${i.type}`)}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 gap-1">
        {i.isCatalog && i.customized && (
          <Button size="sm" variant="ghost" onClick={() => confirm(t("cat2.confirmReset")) && reset.mutate(undefined)}>
            {t("cat2.reset")}
          </Button>
        )}
        <Button size="sm" onClick={onEdit}>
          {t("common.edit")}
        </Button>
      </div>
    </li>
  );
}

function InstitutionForm({ initial, onDone }: { initial?: Institution; onDone: () => void }) {
  const [f, setF] = useState({ id: "", name: initial?.name ?? "", type: initial?.type ?? "issuer" });
  const save = useMutate(() =>
    initial
      ? api.patch(`/institutions/${initial.id}`, { name: f.name.trim(), type: f.type })
      : api.post("/institutions", { name: f.name.trim(), type: f.type, ...(f.id.trim() ? { id: f.id.trim() } : {}) }),
  );
  return (
    <form
      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(undefined, { onSuccess: onDone });
      }}
    >
      <Field label={t("acct.name")} className="sm:col-span-2">
        <Input value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} required />
      </Field>
      {!initial && (
        <Field label={t("cat2.id")} hint={t("cat2.idHint")}>
          <Input value={f.id} onChange={(e) => setF((x) => ({ ...x, id: e.target.value }))} pattern="[a-z0-9_\\-]{2,40}" className="font-mono" />
        </Field>
      )}
      <Field label={t("acct.kind")}>
        <Select value={f.type} onChange={(e) => setF((x) => ({ ...x, type: e.target.value as Institution["type"] }))}>
          {INSTITUTION_TYPES.map((k) => (
            <option key={k} value={k}>
              {td(`cat2.instType.${k}`)}
            </option>
          ))}
        </Select>
      </Field>
      <div className="sm:col-span-2">
        <ErrorText error={save.error} />
      </div>
      <div className="flex justify-end sm:col-span-2">
        <Button type="submit" variant="primary" disabled={save.isPending}>
          {t("common.save")}
        </Button>
      </div>
    </form>
  );
}
