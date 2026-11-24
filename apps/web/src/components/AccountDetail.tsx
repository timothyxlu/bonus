import { annualAmount, BENEFIT_PERIODS, BENEFIT_UNITS, BONUS_REQUIREMENT_TYPES, BONUS_STATUSES, EVENT_TYPES, REWARD_UNITS, type BenefitPeriod, type EventType } from "@bonus/core";
import { useState, type FormEvent, type ReactNode } from "react";
import { t, td, type MessageKey } from "../i18n";
import { api } from "../lib/api";
import { cx, fmtUsd, todayIso } from "../lib/format";
import { useAccount, useMutate, useProducts } from "../lib/queries";
import type { AccountDetail as Detail, Benefit, Bonus } from "../lib/types";
import { AccountForm, ProductSelect } from "./AccountForm";
import { BonusProgress } from "./BonusRow";
import { KindIcon } from "./KindIcon";
import { SecretSection } from "./SecretSection";
import { Badge, Button, ErrorText, Field, Input, ProgressBar, Select, Sheet, Spinner, statusTone } from "./ui";

export function AccountDetailView({ id, onDeleted }: { id: string; onDeleted: () => void }) {
  const { data, isLoading, error } = useAccount(id);
  const [editing, setEditing] = useState(false);
  const del = useMutate(() => api.del(`/accounts/${id}`));
  if (isLoading) return <Spinner />;
  if (error || !data) return <ErrorText error={error} />;
  return (
    <div className="space-y-5">
      <header>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted">{data.institutionName ?? "—"}</p>
            <h2 className="truncate text-lg font-semibold">{data.nickname || data.productName || "—"}</h2>
            {data.nickname && data.productName && <p className="truncate text-sm text-muted">{data.productName}</p>}
          </div>
          <div className="flex shrink-0 gap-1">
            <Button size="sm" onClick={() => setEditing(true)}>
              {t("common.edit")}
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => confirm(t("common.confirmDelete")) && del.mutate(undefined, { onSuccess: onDeleted })}
            >
              {t("common.delete")}
            </Button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge tone={statusTone(data.status)}>{td(`status.${data.status}`)}</Badge>
          <Badge tone="indigo">
            <KindIcon kind={data.kind} small />
            {td(`kind.${data.kind}`)}
          </Badge>
          {data.kind !== "gift_card" && <Badge>{td(`ownerType.${data.ownerType}`)}</Badge>}
          {data.kind === "bank_account" && typeof data.details?.accountType === "string" && <Badge>{td(`acct.accountType.${data.details.accountType}`)}</Badge>}
          {data.last4 && <Badge>••{data.last4}</Badge>}
          {data.isAuthorizedUser && <Badge tone="indigo">AU</Badge>}
          {data.annualFee !== null && <Badge>{t("acct.annualFee", { n: data.annualFee })}</Badge>}
          {data.currency && <Badge>{data.currency}</Badge>}
        </div>
        {data.kind === "gift_card" ? (
          <GiftValue details={data.details} openedAt={data.openedAt} closedAt={data.closedAt} />
        ) : (
          <dl className="tabular mt-3 grid grid-cols-3 gap-2 text-xs">
            <Meta label={t("acct.appliedAt")} value={data.appliedAt} />
            <Meta label={t("acct.openedAt")} value={data.openedAt} />
            <Meta label={t("acct.closedAt")} value={data.closedAt} />
          </dl>
        )}
        {data.notes && <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{data.notes}</p>}
      </header>

      {(data.kind === "credit_card" || data.kind === "gift_card") && <SecretSection accountId={data.id} kind={data.kind} last4={data.last4} />}
      <BonusesSection account={data} />
      {data.kind !== "gift_card" && <BenefitsSection account={data} />}
      <TimelineSection account={data} />

      <Sheet open={editing} onClose={() => setEditing(false)} title={t("acct.edit")} wide>
        <AccountForm initial={data} onDone={() => setEditing(false)} />
      </Sheet>
    </div>
  );
}

function GiftValue({ details, openedAt, closedAt }: { details: Record<string, unknown>; openedAt: string | null; closedAt: string | null }) {
  const face = Number(details?.faceValue);
  const price = Number(details?.purchasePrice);
  const hasFace = Number.isFinite(face) && face > 0;
  const hasPrice = Number.isFinite(price) && price > 0;
  const saved = hasFace && hasPrice ? face - price : null;
  return (
    <dl className="tabular mt-3 grid grid-cols-3 gap-2 text-xs">
      <Meta label={t("acct.faceValue")} value={hasFace ? fmtUsd(face) : null} />
      <Meta label={t("acct.purchasePrice")} value={hasPrice ? fmtUsd(price) : null} />
      <Meta
        label={saved !== null && hasFace ? t("acct.discount", { pct: Math.round((saved / face) * 100) }) : t("acct.openedAt.gift")}
        value={saved !== null ? t("acct.saved", { n: saved }) : openedAt}
      />
      {closedAt && <Meta label={t("acct.closedAt.gift")} value={closedAt} />}
    </dl>
  );
}

function Meta({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-[var(--radius-control)] bg-sunken px-2 py-1.5">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium">{value ?? "—"}</dd>
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------- Bonuses

function BonusesSection({ account }: { account: Detail }) {
  const [editing, setEditing] = useState<Bonus | "new" | null>(null);
  const [progressFor, setProgressFor] = useState<Bonus | null>(null);
  return (
    <Section title={t("detail.bonuses")} action={<Button size="sm" variant="ghost" onClick={() => setEditing("new")}>+ {t("detail.addBonus")}</Button>}>
      {account.bonuses.length === 0 ? (
        <p className="text-sm text-muted">{t("detail.noBonuses")}</p>
      ) : (
        <ul className="space-y-3">
          {account.bonuses.map((b) => (
            <li key={b.id} className="rounded-[var(--radius-row)] bg-sunken p-3">
              <BonusProgress b={b} title={b.description ?? undefined} />
              <div className="mt-2 flex flex-wrap gap-1">
                {b.active && (
                  <Button size="sm" onClick={() => setProgressFor(b)}>
                    {t("detail.updateProgress")}
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setEditing(b)}>
                  {t("common.edit")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing === "new" ? t("detail.addBonus") : t("common.edit")}>
        {editing && <BonusForm accountId={account.id} initial={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} />}
      </Sheet>
      <Sheet open={!!progressFor} onClose={() => setProgressFor(null)} title={t("detail.updateProgress")}>
        {progressFor && <ProgressForm bonus={progressFor} onDone={() => setProgressFor(null)} />}
      </Sheet>
    </Section>
  );
}

function ProgressForm({ bonus, onDone }: { bonus: Bonus; onDone: () => void }) {
  const [v, setV] = useState(String(bonus.progress ?? 0));
  const m = useMutate(() => api.patch(`/bonuses/${bonus.id}`, { progress: Number(v) }));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate(undefined, { onSuccess: onDone });
      }}
      className="space-y-3"
    >
      <Field label={`${t("bonus.progress")} / ${fmtUsd(bonus.amountRequired)}`}>
        <Input type="number" step="0.01" min="0" value={v} onChange={(e) => setV(e.target.value)} autoFocus />
      </Field>
      <ErrorText error={m.error} />
      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={m.isPending}>
          {t("common.save")}
        </Button>
      </div>
    </form>
  );
}

function BonusForm({ accountId, initial, onDone }: { accountId: string; initial?: Bonus; onDone: () => void }) {
  const [f, setF] = useState({
    description: initial?.description ?? "",
    requirementType: initial?.requirementType ?? "spend",
    amountRequired: initial?.amountRequired?.toString() ?? "",
    progress: initial?.progress?.toString() ?? "0",
    deadline: initial?.deadline ?? "",
    rewardAmount: initial?.rewardAmount?.toString() ?? "",
    rewardUnit: initial?.rewardUnit ?? "points",
    status: initial?.status ?? "in_progress",
    earnedAt: initial?.earnedAt ?? "",
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const num = (s: string) => (s === "" ? null : Number(s));
  const body = () => ({
    description: f.description || null,
    requirementType: f.requirementType,
    amountRequired: num(f.amountRequired),
    progress: num(f.progress) ?? 0,
    deadline: f.deadline || null,
    rewardAmount: num(f.rewardAmount),
    rewardUnit: f.rewardUnit,
    status: f.status,
    earnedAt: f.earnedAt || null,
  });
  const save = useMutate(() => (initial ? api.patch(`/bonuses/${initial.id}`, body()) : api.post(`/accounts/${accountId}/bonuses`, body())));
  const del = useMutate(() => api.del(`/bonuses/${initial!.id}`));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(undefined, { onSuccess: onDone });
  };
  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-3">
      <Field label={t("bonus.description")} className="col-span-2">
        <Input value={f.description} onChange={set("description")} placeholder="e.g. 75k after $5k / 3 months" />
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
        <Input type="number" min="0" step="0.01" value={f.amountRequired} onChange={set("amountRequired")} />
      </Field>
      <Field label={t("bonus.progress")}>
        <Input type="number" min="0" step="0.01" value={f.progress} onChange={set("progress")} />
      </Field>
      <Field label={t("bonus.deadline")}>
        <Input type="date" value={f.deadline} onChange={set("deadline")} />
      </Field>
      <Field label={t("bonus.rewardAmount")}>
        <Input type="number" min="0" value={f.rewardAmount} onChange={set("rewardAmount")} />
      </Field>
      <Field label={t("bonus.rewardUnit")}>
        <Select value={f.rewardUnit} onChange={set("rewardUnit")}>
          {REWARD_UNITS.map((x) => (
            <option key={x} value={x}>
              {td(`unit.${x}`)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("bonus.status")}>
        <Select value={f.status} onChange={set("status")}>
          {BONUS_STATUSES.map((x) => (
            <option key={x} value={x}>
              {td(`bonusStatus.${x}`)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("bonus.earnedAt")}>
        <Input type="date" value={f.earnedAt} onChange={set("earnedAt")} />
      </Field>
      <div className="col-span-2">
        <ErrorText error={save.error ?? del.error} />
      </div>
      <div className="col-span-2 flex justify-between gap-2">
        {initial ? (
          <Button type="button" variant="danger" onClick={() => confirm(t("common.confirmDelete")) && del.mutate(undefined, { onSuccess: onDone })}>
            {t("common.delete")}
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" variant="primary" disabled={save.isPending}>
          {t("common.save")}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- Benefits

/** "$15" for USD; "1 晚" / "1 张" for other units. */
export function fmtBenefitAmount(b: Pick<Benefit, "unit">, n: number) {
  if ((b.unit ?? "USD") === "USD") return fmtUsd(n);
  return t(`benefit.unitCount.${b.unit}` as MessageKey, { n });
}

function periodLabel(b: Pick<Benefit, "period" | "everyMonths">) {
  if (b.period === "every_n_years") {
    const years = (b.everyMonths ?? 48) / 12;
    return t("period.everyNYears", { n: Number.isInteger(years) ? years : years.toFixed(1) });
  }
  return td(`period.${b.period}`);
}

export function BenefitItem({ b, showAccount, allowEdit, onCreateCertificate }: { b: Benefit; showAccount?: boolean; allowEdit?: boolean; onCreateCertificate?: () => void }) {
  const isUsd = (b.unit ?? "USD") === "USD";
  const [using, setUsing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(isUsd ? String(b.remaining || b.periodAmount || b.amount) : "1");
  const [date, setDate] = useState(todayIso());
  const use = useMutate(() => api.post(`/benefits/${b.id}/uses`, { usedOn: date, amount: Number(amount) }));
  const undo = useMutate((useId: string) => api.del(`/benefit-uses/${useId}`));
  const quota = isUsd ? (b.periodAmount ?? b.amount) : Math.max(1, b.periodAmount ?? b.amount);
  const yearly = annualAmount(b);
  return (
    <div className={cx("rounded-[var(--radius-row)] p-3", b.unused ? "bg-warn-soft" : "bg-sunken", b.inEffect === false && "opacity-60")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
            <span className="truncate">{b.name}</span>
            {b.enrollmentRequired && <Badge tone="indigo">{t("benefit.enroll")}</Badge>}
            {!b.active && <Badge>{t("benefit.archived")}</Badge>}
          </p>
          <p className="text-xs text-muted">
            {showAccount && b.accountLabel && <>{b.accountLabel} · </>}
            {periodLabel(b)} · {t("detail.periodEnds", { date: b.currentPeriod.end })}
            {yearly > 0 && <> · {t("benefit.perYear", { v: fmtBenefitAmount(b, Math.round(yearly * 100) / 100) })}</>}
          </p>
          {b.valueDescription && <p className="text-xs text-muted">{b.valueDescription}</p>}
          {b.limitations && <p className="mt-0.5 text-xs text-muted">{b.limitations}</p>}
          {(b.startsAt || b.endsAt) && (
            <p className="tabular text-xs text-faint">
              {b.startsAt && t("benefit.from", { date: b.startsAt })} {b.endsAt && t("benefit.until", { date: b.endsAt })}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge tone={b.unused ? "amber" : "green"}>
            {t("detail.usedOf", { used: fmtBenefitAmount(b, b.used), amount: fmtBenefitAmount(b, quota) })}
          </Badge>
          {b.sourceUrl && (
            <a href={b.sourceUrl} target="_blank" rel="noreferrer noopener" className="text-xs text-brand hover:underline">
              {t("opp.source")}
            </a>
          )}
        </div>
      </div>
      <div className="mt-2">
        <ProgressBar ratio={quota ? b.used / quota : b.unused ? 0 : 1} tone={b.unused ? "amber" : "green"} />
      </div>
      {b.uses.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1">
          {b.uses
            .filter((u) => u.usedOn >= b.currentPeriod.start)
            .map((u) => (
              <li key={u.id}>
                <button className="rounded-md bg-surface px-1.5 py-0.5 text-xs text-muted ring-1 ring-line hover:line-through" title="撤销" onClick={() => undo.mutate(u.id)}>
                  {u.usedOn} {fmtBenefitAmount(b, u.amount || 1)} ✕
                </button>
              </li>
            ))}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {using ? (
          <form
            className="flex flex-wrap items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              use.mutate(undefined, { onSuccess: () => setUsing(false) });
            }}
          >
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="!h-8 w-36" />
            <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="!h-8 w-24" aria-label={t("benefit.useAmount")} />
            <Button size="sm" variant="primary" type="submit" disabled={use.isPending}>
              {t("common.save")}
            </Button>
            <Button size="sm" variant="ghost" type="button" onClick={() => setUsing(false)}>
              {t("common.cancel")}
            </Button>
          </form>
        ) : (
          <>
            {b.inEffect !== false && b.active && (
              <Button size="sm" onClick={() => setUsing(true)}>
                {t("detail.markUsed")}
              </Button>
            )}
            {allowEdit && (
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                {t("common.edit")}
              </Button>
            )}
            {onCreateCertificate && (
              <Button size="sm" variant="ghost" onClick={onCreateCertificate}>
                {t("certificate.createFromBenefit")}
              </Button>
            )}
          </>
        )}
      </div>
      {allowEdit && (
        <Sheet open={editing} onClose={() => setEditing(false)} title={t("benefit.edit")} wide>
          {editing && <BenefitForm accountId={b.accountId} initial={b} onDone={() => setEditing(false)} />}
        </Sheet>
      )}
    </div>
  );
}

function BenefitsSection({ account }: { account: Detail }) {
  const [adding, setAdding] = useState(false);
  return (
    <Section title={t("detail.benefits")} action={<Button size="sm" variant="ghost" onClick={() => setAdding(true)}>+ {t("detail.addBenefit")}</Button>}>
      {account.benefits.length === 0 ? (
        <p className="text-sm text-muted">{t("detail.noBenefits")}</p>
      ) : (
        <div className="space-y-2">
          {account.benefits.map((b) => (
            <BenefitItem key={b.id} b={b} allowEdit />
          ))}
        </div>
      )}
      <Sheet open={adding} onClose={() => setAdding(false)} title={t("detail.addBenefit")} wide>
        {adding && <BenefitForm accountId={account.id} onDone={() => setAdding(false)} />}
      </Sheet>
    </Section>
  );
}

const OVERRIDE_SLOTS: Partial<Record<BenefitPeriod, number>> = { monthly: 12, quarterly: 4, semiannual: 2 };

export function BenefitForm({ accountId, initial, onDone }: { accountId: string; initial?: Benefit; onDone: () => void }) {
  const s = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));
  const [f, setF] = useState({
    name: initial?.name ?? "",
    amount: s(initial?.amount),
    period: (initial?.period ?? "monthly") as BenefitPeriod,
    unit: initial?.unit ?? "USD",
    everyYears: initial?.everyMonths ? String(initial.everyMonths / 12) : "4",
    valueDescription: initial?.valueDescription ?? "",
    estValueUsd: s(initial?.estValueUsd),
    enrollmentRequired: initial?.enrollmentRequired ?? false,
    limitations: initial?.limitations ?? "",
    sourceUrl: initial?.sourceUrl ?? "",
    startsAt: initial?.startsAt ?? "",
    endsAt: initial?.endsAt ?? "",
    notes: initial?.notes ?? "",
    active: initial?.active ?? true,
    overrides: Object.fromEntries(Object.entries(initial?.amountByPeriod ?? {}).map(([k, v]) => [k, String(v)])) as Record<string, string>,
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  const slots = OVERRIDE_SLOTS[f.period] ?? 0;
  const slotLabel = (i: number) => (f.period === "monthly" ? t("benefit.slot.month", { n: i }) : f.period === "quarterly" ? `Q${i}` : i === 1 ? t("benefit.slot.h1") : t("benefit.slot.h2"));
  const isUsd = f.unit === "USD";

  const save = useMutate(() => {
    const overrides = Object.fromEntries(
      Object.entries(f.overrides)
        .filter(([k, v]) => v.trim() !== "" && Number(k) <= slots)
        .map(([k, v]) => [k, Number(v)]),
    );
    const body = {
      name: f.name.trim(),
      amount: Number(f.amount || 0),
      period: f.period,
      unit: f.unit,
      everyYears: f.period === "every_n_years" ? Number(f.everyYears) : null,
      everyMonths: f.period === "every_n_years" ? undefined : null,
      amountByPeriod: slots && Object.keys(overrides).length ? overrides : null,
      valueDescription: isUsd ? null : f.valueDescription.trim() || null,
      estValueUsd: isUsd ? null : num(f.estValueUsd),
      enrollmentRequired: f.enrollmentRequired,
      limitations: f.limitations.trim() || null,
      sourceUrl: f.sourceUrl.trim() || null,
      startsAt: f.startsAt || null,
      endsAt: f.endsAt || null,
      notes: f.notes.trim() || null,
      active: f.active,
    };
    return initial ? api.patch(`/benefits/${initial.id}`, body) : api.post(`/accounts/${accountId}/benefits`, body);
  });
  const del = useMutate(() => api.del(`/benefits/${initial!.id}`));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(undefined, { onSuccess: onDone });
      }}
      className="grid grid-cols-2 gap-3"
    >
      <Field label={t("benefit.name")} className="col-span-2">
        <Input value={f.name} onChange={set("name")} required placeholder="e.g. Uber Cash" />
      </Field>
      <Field label={t("benefit.unit")}>
        <Select value={f.unit} onChange={set("unit")}>
          {BENEFIT_UNITS.map((u) => (
            <option key={u} value={u}>
              {td(`benefit.unit.${u}`)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={isUsd ? t("benefit.amount") : t("benefit.count")}>
        <Input type="number" min="0" step={isUsd ? "0.01" : "1"} value={f.amount} onChange={set("amount")} required />
      </Field>
      <Field label={t("benefit.period")}>
        <Select value={f.period} onChange={set("period")}>
          {BENEFIT_PERIODS.map((p) => (
            <option key={p} value={p}>
              {td(`period.${p}`)}
            </option>
          ))}
        </Select>
      </Field>
      {f.period === "every_n_years" ? (
        <Field label={t("benefit.everyYears")} hint={t("benefit.everyYearsHint")}>
          <Input type="number" min="0.5" max="20" step="0.5" value={f.everyYears} onChange={set("everyYears")} required />
        </Field>
      ) : (
        <span />
      )}
      {!isUsd && (
        <>
          <Field label={t("benefit.valueDescription")} className="col-span-2">
            <Input value={f.valueDescription} onChange={set("valueDescription")} placeholder="e.g. Free night up to 35k points" />
          </Field>
          <Field label={t("benefit.estValueUsd")}>
            <Input type="number" min="0" value={f.estValueUsd} onChange={set("estValueUsd")} />
          </Field>
          <span />
        </>
      )}
      {slots > 0 && (
        <fieldset className="col-span-2 rounded-[var(--radius-row)] border border-line p-3">
          <legend className="px-1 text-sm font-medium text-muted">{t("benefit.overrides")}</legend>
          <p className="mb-2 text-xs text-muted">{t("benefit.overridesHint")}</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {Array.from({ length: slots }, (_, i) => i + 1).map((i) => (
              <Field key={i} label={slotLabel(i)}>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={f.overrides[String(i)] ?? ""}
                  placeholder={f.amount || "—"}
                  onChange={(e) => setF((x) => ({ ...x, overrides: { ...x.overrides, [String(i)]: e.target.value } }))}
                />
              </Field>
            ))}
          </div>
        </fieldset>
      )}
      <Field label={t("benefit.limitations")} className="col-span-2">
        <Input value={f.limitations} onChange={set("limitations")} placeholder={t("common.optional")} />
      </Field>
      <Field label={t("benefit.startsAt")}>
        <Input type="date" value={f.startsAt} onChange={set("startsAt")} />
      </Field>
      <Field label={t("benefit.endsAt")}>
        <Input type="date" value={f.endsAt} onChange={set("endsAt")} />
      </Field>
      <Field label={t("opp.f.sourceUrl")} className="col-span-2">
        <Input type="url" value={f.sourceUrl} onChange={set("sourceUrl")} placeholder="https://" />
      </Field>
      <Field label={t("acct.notes")} className="col-span-2">
        <Input value={f.notes} onChange={set("notes")} />
      </Field>
      <label className="flex min-h-10 items-center gap-2 text-sm">
        <input type="checkbox" checked={f.enrollmentRequired} onChange={(e) => setF((x) => ({ ...x, enrollmentRequired: e.target.checked }))} className="h-4 w-4" />
        {t("benefit.enrollmentRequired")}
      </label>
      <label className="flex min-h-10 items-center gap-2 text-sm">
        <input type="checkbox" checked={!f.active} onChange={(e) => setF((x) => ({ ...x, active: !e.target.checked }))} className="h-4 w-4" />
        {t("benefit.archive")}
      </label>
      <div className="col-span-2">
        <ErrorText error={save.error ?? del.error} />
      </div>
      <div className="col-span-2 flex justify-between gap-2">
        {initial ? (
          <Button type="button" variant="danger" onClick={() => confirm(t("common.confirmDelete")) && del.mutate(undefined, { onSuccess: onDone })}>
            {t("common.delete")}
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" variant="primary" disabled={save.isPending}>
          {t("common.save")}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- Timeline

const eventTone = (type: EventType) =>
  type === "approved" || type === "bonus_earned" ? "bg-money" : type === "denied" || type === "closed" ? "bg-danger" : type === "note" ? "bg-faint" : "bg-brand";

function TimelineSection({ account }: { account: Detail }) {
  const [adding, setAdding] = useState(false);
  const { data: products = [] } = useProducts();
  const name = (id: string | null) => products.find((p) => p.id === id)?.name ?? id;
  const del = useMutate((id: string) => api.del(`/events/${id}`));
  return (
    <Section title={t("detail.timeline")} action={<Button size="sm" variant="ghost" onClick={() => setAdding(true)}>+ {t("detail.addEvent")}</Button>}>
      {account.events.length === 0 ? (
        <p className="text-sm text-muted">{t("detail.noEvents")}</p>
      ) : (
        <ol className="relative ml-1.5 space-y-3 border-l border-line pl-4">
          {account.events.map((e) => (
            <li key={e.id} className="group relative">
              <span className={cx("absolute -left-[21.5px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-surface", eventTone(e.type))} />
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">
                    {td(`event.${e.type}`)}
                    {e.toProductId && (
                      <span className="font-normal text-muted">
                        {" "}
                        {name(e.fromProductId)} → {name(e.toProductId)}
                      </span>
                    )}
                  </p>
                  <p className="tabular text-xs text-muted">{e.date}</p>
                  {e.note && <p className="mt-0.5 text-sm text-muted">{e.note}</p>}
                </div>
                <button className="text-xs text-faint opacity-60 hover:text-danger group-hover:opacity-100" onClick={() => confirm(t("common.confirmDelete")) && del.mutate(e.id)} aria-label={t("common.delete")}>
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
      <Sheet open={adding} onClose={() => setAdding(false)} title={t("detail.addEvent")}>
        {adding && <EventForm account={account} onDone={() => setAdding(false)} />}
      </Sheet>
    </Section>
  );
}

function EventForm({ account, onDone }: { account: Detail; onDone: () => void }) {
  const { data: products = [] } = useProducts();
  const [f, setF] = useState({ type: "note" as EventType, date: todayIso(), toProductId: "", note: "" });
  const needsProduct = ["product_change", "upgrade", "downgrade"].includes(f.type);
  const save = useMutate(() =>
    api.post(`/accounts/${account.id}/events`, { type: f.type, date: f.date, toProductId: needsProduct ? f.toProductId : null, note: f.note || null }),
  );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(undefined, { onSuccess: onDone });
      }}
      className="grid grid-cols-2 gap-3"
    >
      <Field label={t("event.type")}>
        <Select value={f.type} onChange={(e) => setF((s) => ({ ...s, type: e.target.value as EventType }))}>
          {EVENT_TYPES.map((x) => (
            <option key={x} value={x}>
              {td(`event.${x}`)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("event.date")}>
        <Input type="date" value={f.date} onChange={(e) => setF((s) => ({ ...s, date: e.target.value }))} required />
      </Field>
      {needsProduct && (
        <Field label={t("detail.toProduct")} className="col-span-2">
          <ProductSelect value={f.toProductId} onChange={(v) => setF((s) => ({ ...s, toProductId: v }))} products={products.filter((p) => p.kind === account.kind)} required />
        </Field>
      )}
      <Field label={t("event.note.label")} className="col-span-2">
        <Input value={f.note} onChange={(e) => setF((s) => ({ ...s, note: e.target.value }))} />
      </Field>
      <div className="col-span-2">
        <ErrorText error={save.error} />
      </div>
      <div className="col-span-2 flex justify-end">
        <Button type="submit" variant="primary" disabled={save.isPending}>
          {t("common.save")}
        </Button>
      </div>
    </form>
  );
}
