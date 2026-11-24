import { ACCOUNT_KINDS, BONUS_REQUIREMENT_TYPES, REWARD_UNITS, type AccountKind } from "@bonus/core";
import { useMemo, useState, type FormEvent } from "react";
import { ProductSelect } from "../components/AccountForm";
import { IconExternal, IconPlus } from "../components/icons";
import { KindFilter } from "../components/KindFilter";
import { KindIcon } from "../components/KindIcon";
import { ReasonList } from "../components/ReasonList";
import { Badge, Button, Empty, ErrorText, Field, Input, IssuerChip, Select, Sheet, Spinner, Textarea, type Tone } from "../components/ui";
import { t, td } from "../i18n";
import { api } from "../lib/api";
import { cx, fmtNum, fmtUsd, todayIso } from "../lib/format";
import { useInstitutions, useMutate, useOpportunities, useProducts } from "../lib/queries";
import { useRouter } from "../lib/router";
import type { Opportunity } from "../lib/types";

const statusTone: Record<string, Tone> = { eligible: "green", blocked: "red", uncertain: "amber" };
type SortKey = "net" | "roi" | "expiry";

export function OpportunitiesPage() {
  const [archived, setArchived] = useState(false);
  const { data = [], isLoading, error } = useOpportunities(archived);
  const [kind, setKind] = useState<AccountKind | "">("");
  const [eligibleOnly, setEligibleOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>("net");
  const [editing, setEditing] = useState<Opportunity | "new" | null>(null);
  const [claiming, setClaiming] = useState<Opportunity | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: data.length };
    for (const o of data) c[o.kind] = (c[o.kind] ?? 0) + 1;
    return c;
  }, [data]);

  const rows = useMemo(() => {
    const list = data.filter((o) => (!kind || o.kind === kind) && (!eligibleOnly || o.eligibility.status !== "blocked"));
    if (sort === "net") return list; // server order: available first, by net value
    const avail = (o: Opportunity) => (o.eligibility.status === "blocked" ? 1 : 0);
    return [...list].sort((a, b) =>
      avail(a) - avail(b) ||
      (sort === "roi"
        ? (b.value.returnOnRequired ?? -1) - (a.value.returnOnRequired ?? -1)
        : (a.expiresAt ?? "9999").localeCompare(b.expiresAt ?? "9999")),
    );
  }, [data, kind, eligibleOnly, sort]);

  const available = data.filter((o) => o.status === "active" && o.eligibility.status !== "blocked" && (!kind || o.kind === kind));
  const availableNet = available.reduce((s, o) => s + Math.max(0, o.value.netUsd), 0);

  if (isLoading) return <Spinner />;
  if (error) return <ErrorText error={error} />;

  return (
    <div className="space-y-4 lg:space-y-5">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="hidden text-2xl font-semibold tracking-tight lg:block">{t("opp.title")}</h1>
          <p className="text-sm text-muted">{t("opp.subtitle")}</p>
        </div>
        <Button variant="primary" onClick={() => setEditing("new")} className="self-start lg:self-auto">
          <IconPlus /> {t("opp.add")}
        </Button>
      </header>

      {data.length > 0 && (
        <section className="flex flex-wrap items-baseline gap-x-6 gap-y-1 rounded-[var(--radius-panel)] border border-line bg-surface px-4 py-3 sm:px-5">
          <p className="text-sm text-muted">{t("opp.top")}</p>
          <p className="tabular text-2xl font-semibold tracking-tight text-money">{fmtUsd(Math.round(availableNet))}</p>
          <p className="text-sm text-muted">{t("opp.availableCount", { n: available.length, total: data.filter((o) => !kind || o.kind === kind).length })}</p>
        </section>
      )}

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <KindFilter value={kind} onChange={setKind} counts={counts} />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="flex min-h-10 items-center gap-2 text-sm">
            <input type="checkbox" checked={eligibleOnly} onChange={(e) => setEligibleOnly(e.target.checked)} className="h-4 w-4" />
            {t("opp.eligibleOnly")}
          </label>
          <label className="flex min-h-10 items-center gap-2 text-sm">
            <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} className="h-4 w-4" />
            {t("opp.showArchived")}
          </label>
          <Select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="w-auto" aria-label="sort">
            <option value="net">{t("opp.sort.net")}</option>
            <option value="roi">{t("opp.sort.roi")}</option>
            <option value="expiry">{t("opp.sort.expiry")}</option>
          </Select>
        </div>
      </div>

      {rows.length === 0 ? (
        <Empty>{t("opp.empty")}</Empty>
      ) : (
        <ol className="space-y-2">
          {rows.map((o, i) => (
            <OpportunityRow key={o.id} o={o} rank={i + 1} onEdit={() => setEditing(o)} onClaim={() => setClaiming(o)} />
          ))}
        </ol>
      )}

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing === "new" ? t("opp.add") : t("opp.edit")} wide>
        {editing && <OfferForm initial={editing === "new" ? undefined : editing} defaultKind={kind || "credit_card"} onDone={() => setEditing(null)} />}
      </Sheet>
      <Sheet open={!!claiming} onClose={() => setClaiming(null)} title={t("opp.claimTitle")}>
        {claiming && <ClaimForm o={claiming} onDone={() => setClaiming(null)} />}
      </Sheet>
    </div>
  );
}

function reward(o: Opportunity) {
  return o.rewardUnit === "USD" ? fmtUsd(o.rewardAmount) : `${fmtNum(o.rewardAmount)} ${td(`unit.${o.rewardUnit}`)}`;
}

function OpportunityRow({ o, rank, onEdit, onClaim }: { o: Opportunity; rank: number; onEdit: () => void; onClaim: () => void }) {
  const [open, setOpen] = useState(false);
  const archive = useMutate(() => api.patch(`/offers/${o.id}`, { status: o.status === "active" ? "archived" : "active" }));
  const blocked = o.eligibility.status === "blocked";
  const roi = o.value.returnOnRequired;
  return (
    <li
      className={cx(
        "rounded-[var(--radius-panel)] border border-line bg-surface p-4 sm:p-5",
        (blocked || o.status === "archived") && "bg-sunken",
      )}
    >
      <div className="grid gap-x-6 gap-y-3 lg:grid-cols-[2rem_minmax(0,2.2fr)_minmax(7rem,1fr)_minmax(0,1.4fr)_minmax(9rem,1fr)] lg:items-center">
        <span className={cx("tabular hidden text-lg font-semibold lg:block", blocked ? "text-faint" : "text-brand")} aria-label={`#${rank}`}>
          {rank}
        </span>

        <div className="flex min-w-0 items-start gap-3">
          <IssuerChip issuer={o.institutionId} closed={blocked} />
          <div className="min-w-0">
            <p className={cx("font-semibold", blocked && "text-muted")}>{o.title}</p>
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
              <span className="inline-flex items-center gap-1">
                <KindIcon kind={o.kind} small />
                {td(`kind.${o.kind}`)}
              </span>
              <span>{o.productName ?? o.institutionName}</span>
              {o.expiresAt && <span className={cx("tabular", o.expired && "text-danger")}>{o.expired ? t("opp.expired") : t("opp.expires", { date: o.expiresAt })}</span>}
              {o.status === "archived" && <Badge>{t("opp.archive")}</Badge>}
            </p>
          </div>
        </div>

        <div className="flex items-baseline justify-between gap-3 lg:block">
          <p className="text-xs text-muted lg:mb-0.5">{t("opp.net")}</p>
          <p className={cx("tabular text-2xl font-semibold tracking-tight", blocked ? "text-muted" : o.value.netUsd > 0 ? "text-money" : "text-danger")}>
            {fmtUsd(Math.round(o.value.netUsd))}
          </p>
        </div>

        <div className="tabular space-y-0.5 text-sm">
          <p>
            <span className="font-medium">{reward(o)}</span>
            {o.rewardUnit !== "USD" && <span className="text-muted"> ≈ {fmtUsd(Math.round(o.value.grossUsd))}</span>}
            {o.rewardUnit !== "USD" && <span className="ml-1 text-xs text-faint">{t("opp.cpp", { c: o.value.centsPerPoint })}</span>}
          </p>
          <p className="text-muted">
            {o.amountRequired ? t("opp.req", { type: td(`req.${o.requirementType}`), amount: fmtUsd(o.amountRequired) }) : td(`req.${o.requirementType}`)}
            {o.windowMonths ? `，${t("opp.window", { n: o.windowMonths })}` : ""}
          </p>
          <p className="text-xs text-muted">
            {o.feeWaivedFirstYear ? t("opp.feeWaived") : o.value.costUsd > 0 ? t("opp.cost", { v: fmtUsd(o.value.costUsd) }) : null}
            {roi !== null && <span className={o.value.costUsd > 0 || o.feeWaivedFirstYear ? "ml-2" : ""}>{t("opp.roi", { v: (roi * 100).toFixed(1) })}</span>}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 lg:flex-col lg:items-end">
          <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex min-h-10 items-center gap-2 text-left">
            <Badge tone={statusTone[o.eligibility.status]}>{td(`elig.status.${o.eligibility.status}`)}</Badge>
            {blocked && <span className="tabular text-xs text-muted">{o.eligibility.eligibleFrom ? t("opp.availableFrom", { date: o.eligibility.eligibleFrom }) : t("opp.noDate")}</span>}
            <span className="text-xs text-brand underline-offset-2 hover:underline">{t("opp.whyBlocked")}</span>
          </button>
          <div className="flex items-center gap-1">
            {o.sourceUrl && (
              <a href={o.sourceUrl} target="_blank" rel="noreferrer noopener" className="grid h-11 w-11 place-items-center rounded-[var(--radius-control)] text-muted hover:bg-sunken hover:text-ink sm:h-8 sm:w-8" aria-label={t("opp.source")}>
                <IconExternal small />
              </a>
            )}
            <Button size="sm" variant="ghost" onClick={onEdit}>
              {t("common.edit")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => archive.mutate(undefined)}>
              {o.status === "active" ? t("opp.archive") : t("opp.unarchive")}
            </Button>
            {!blocked && o.status === "active" && (
              <Button size="sm" variant="primary" onClick={onClaim}>
                {t("opp.claim")}
              </Button>
            )}
          </div>
        </div>
      </div>
      {open && (
        <div className="mt-3 border-t border-line pt-3 lg:ml-14">
          <ReasonList reasons={o.eligibility.reasons} />
          {o.notes && <p className="mt-2 text-sm whitespace-pre-wrap text-muted">{o.notes}</p>}
        </div>
      )}
    </li>
  );
}

function ClaimForm({ o, onDone }: { o: Opportunity; onDone: () => void }) {
  const { navigate } = useRouter();
  const [openedAt, setOpenedAt] = useState(todayIso());
  const [last4, setLast4] = useState("");
  const claim = useMutate(() => api.post<{ accountId: string }>(`/offers/${o.id}/claim`, { openedAt, last4: last4 || null }));
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        claim.mutate(undefined, {
          onSuccess: (r) => {
            onDone();
            navigate(`/accounts/${r.accountId}`);
          },
        });
      }}
    >
      <p className="text-sm text-muted">{t("opp.claimHint")}</p>
      <p className="font-medium">{o.title}</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("acct.openedAt")}>
          <Input type="date" value={openedAt} onChange={(e) => setOpenedAt(e.target.value)} required />
        </Field>
        <Field label={t("acct.last4")} hint={t("acct.last4Hint")}>
          <Input value={last4} onChange={(e) => setLast4(e.target.value)} inputMode="numeric" pattern="\d{4,5}" maxLength={5} placeholder="1234" autoComplete="off" />
        </Field>
      </div>
      <ErrorText error={claim.error} />
      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={claim.isPending}>
          {t("opp.claim")}
        </Button>
      </div>
    </form>
  );
}

const NEW_INST = "__new__";

function OfferForm({ initial, defaultKind, onDone }: { initial?: Opportunity; defaultKind: AccountKind; onDone: () => void }) {
  const { data: products = [] } = useProducts();
  const { data: institutions = [] } = useInstitutions();
  const s = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));
  const [f, setF] = useState(() => ({
    kind: initial?.kind ?? defaultKind,
    productId: initial?.productId ?? "",
    institutionId: initial?.productId ? "" : (initial?.institutionId ?? ""),
    newInstitution: "",
    title: initial?.title ?? "",
    rewardAmount: s(initial?.rewardAmount),
    rewardUnit: initial?.rewardUnit ?? (defaultKind === "credit_card" ? "points" : "USD"),
    centsPerPoint: s(initial?.centsPerPoint),
    estValueUsd: s(initial?.estValueUsd),
    requirementType: initial?.requirementType ?? (defaultKind === "bank_account" ? "direct_deposit" : "spend"),
    amountRequired: s(initial?.amountRequired),
    windowMonths: s(initial?.windowMonths),
    annualFee: s(initial?.annualFee),
    feeWaivedFirstYear: initial?.feeWaivedFirstYear ?? false,
    otherCost: s(initial?.otherCost),
    cooldownMonths: s(initial?.cooldownMonths),
    expiresAt: initial?.expiresAt ?? "",
    sourceUrl: initial?.sourceUrl ?? "",
    notes: initial?.notes ?? "",
  }));
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  const isCard = f.kind === "credit_card";
  const kindProducts = products.filter((p) => p.kind === f.kind);
  const useProduct = isCard && kindProducts.length > 0;

  const save = useMutate(async () => {
    const common = {
      title: f.title.trim(),
      rewardAmount: Number(f.rewardAmount || 0),
      rewardUnit: f.rewardUnit,
      centsPerPoint: num(f.centsPerPoint),
      estValueUsd: num(f.estValueUsd),
      requirementType: f.requirementType,
      amountRequired: num(f.amountRequired),
      windowMonths: num(f.windowMonths),
      annualFee: num(f.annualFee),
      feeWaivedFirstYear: f.feeWaivedFirstYear,
      otherCost: num(f.otherCost),
      cooldownMonths: num(f.cooldownMonths),
      expiresAt: f.expiresAt || null,
      sourceUrl: f.sourceUrl.trim() || null,
      notes: f.notes.trim() || null,
    };
    if (initial) return api.patch(`/offers/${initial.id}`, common);
    let institutionId: string | null = useProduct ? null : f.institutionId || null;
    if (!useProduct && f.institutionId === NEW_INST) {
      const type = f.kind === "bank_account" ? "bank" : f.kind === "gift_card" ? "merchant" : "issuer";
      institutionId = (await api.post<{ id: string }>("/institutions", { name: f.newInstitution.trim(), type })).id;
    }
    return api.post("/offers", { kind: f.kind, productId: useProduct ? f.productId || null : null, institutionId, ...common });
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(undefined, { onSuccess: onDone });
  };

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
              onClick={() =>
                setF((x) => ({ ...x, kind: k, productId: "", institutionId: "", rewardUnit: k === "credit_card" ? "points" : "USD", requirementType: k === "bank_account" ? "direct_deposit" : "spend" }))
              }
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

      {!initial &&
        (useProduct ? (
          <Field label={t("acct.product")} className="sm:col-span-2">
            <ProductSelect value={f.productId} onChange={(v) => setF((x) => ({ ...x, productId: v }))} products={kindProducts} required />
          </Field>
        ) : (
          <>
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
          </>
        ))}

      <Field label={t("opp.f.title")} className="sm:col-span-2">
        <Input value={f.title} onChange={set("title")} placeholder={t("opp.f.titleHint")} required />
      </Field>
      <Field label={t("opp.f.reward")}>
        <Input type="number" min="0" value={f.rewardAmount} onChange={set("rewardAmount")} required />
      </Field>
      <Field label={t("bonus.rewardUnit")}>
        <Select value={f.rewardUnit} onChange={set("rewardUnit")}>
          {REWARD_UNITS.map((u) => (
            <option key={u} value={u}>
              {td(`unit.${u}`)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("bonus.requirementType")}>
        <Select value={f.requirementType} onChange={set("requirementType")}>
          {BONUS_REQUIREMENT_TYPES.map((x) => (
            <option key={x} value={x}>
              {td(`req.${x}`)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("bonus.amountRequired")}>
        <Input type="number" min="0" value={f.amountRequired} onChange={set("amountRequired")} />
      </Field>
      <Field label={t("opp.f.windowMonths")}>
        <Input type="number" min="0" max="60" value={f.windowMonths} onChange={set("windowMonths")} />
      </Field>
      <Field label={t("opp.f.expiresAt")}>
        <Input type="date" value={f.expiresAt} onChange={set("expiresAt")} />
      </Field>
      {f.rewardUnit !== "USD" && (
        <Field label={t("opp.f.cpp")} hint={t("opp.f.cppHint")}>
          <Input type="number" min="0" step="0.05" value={f.centsPerPoint} onChange={set("centsPerPoint")} />
        </Field>
      )}
      <Field label={t("opp.f.value")}>
        <Input type="number" min="0" value={f.estValueUsd} onChange={set("estValueUsd")} />
      </Field>
      {isCard && (
        <Field label={t("opp.f.annualFee")} hint={t("opp.f.annualFeeHint")}>
          <Input type="number" min="0" value={f.annualFee} onChange={set("annualFee")} />
        </Field>
      )}
      <Field label={t("opp.f.otherCost")}>
        <Input type="number" min="0" value={f.otherCost} onChange={set("otherCost")} />
      </Field>
      {!isCard && (
        <Field label={t("opp.f.cooldown")} hint={t("opp.f.cooldownHint")}>
          <Input type="number" min="0" max="120" value={f.cooldownMonths} onChange={set("cooldownMonths")} />
        </Field>
      )}
      {isCard && (
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={f.feeWaivedFirstYear} onChange={(e) => setF((x) => ({ ...x, feeWaivedFirstYear: e.target.checked }))} className="h-4 w-4" />
          {t("opp.f.feeWaived")}
        </label>
      )}
      <Field label={t("opp.f.sourceUrl")} className="sm:col-span-2">
        <Input type="url" value={f.sourceUrl} onChange={set("sourceUrl")} placeholder="https://" />
      </Field>
      <Field label={t("acct.notes")} className="sm:col-span-2">
        <Textarea rows={2} value={f.notes} onChange={set("notes")} />
      </Field>
      <div className="sm:col-span-2">
        <ErrorText error={save.error} />
      </div>
      <div className="flex justify-between gap-2 sm:col-span-2">
        {initial ? <DeleteOffer id={initial.id} onDone={onDone} /> : <span />}
        <Button type="submit" variant="primary" disabled={save.isPending}>
          {t("common.save")}
        </Button>
      </div>
    </form>
  );
}

function DeleteOffer({ id, onDone }: { id: string; onDone: () => void }) {
  const del = useMutate(() => api.del(`/offers/${id}`));
  return (
    <Button type="button" variant="danger" onClick={() => confirm(t("common.confirmDelete")) && del.mutate(undefined, { onSuccess: onDone })}>
      {t("common.delete")}
    </Button>
  );
}
