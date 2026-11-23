import { BENEFIT_PERIODS, BONUS_REQUIREMENT_TYPES, BONUS_STATUSES, EVENT_TYPES, REWARD_UNITS, type EventType } from "@bonus/core";
import { useState, type FormEvent, type ReactNode } from "react";
import { t, td } from "../i18n";
import { api } from "../lib/api";
import { cx, fmtUsd, todayIso } from "../lib/format";
import { useAccount, useMutate, useProducts } from "../lib/queries";
import type { AccountDetail as Detail, Benefit, Bonus } from "../lib/types";
import { AccountForm, ProductSelect } from "./AccountForm";
import { BonusProgress } from "./BonusRow";
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
            <p className="text-xs text-slate-500">{data.institutionName ?? "—"}</p>
            <h2 className="truncate text-lg font-semibold">{data.nickname || data.productName || "—"}</h2>
            {data.nickname && data.productName && <p className="truncate text-sm text-slate-500">{data.productName}</p>}
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
          <Badge>{td(`ownerType.${data.ownerType}`)}</Badge>
          {data.last4 && <Badge>···{data.last4}</Badge>}
          {data.isAuthorizedUser && <Badge tone="indigo">AU</Badge>}
          {data.annualFee !== null && <Badge>{t("acct.annualFee", { n: data.annualFee })}</Badge>}
          {data.currency && <Badge>{data.currency}</Badge>}
        </div>
        <dl className="tabular mt-3 grid grid-cols-3 gap-2 text-xs">
          <Meta label={t("acct.appliedAt")} value={data.appliedAt} />
          <Meta label={t("acct.openedAt")} value={data.openedAt} />
          <Meta label={t("acct.closedAt")} value={data.closedAt} />
        </dl>
        {data.notes && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-400">{data.notes}</p>}
      </header>

      <BonusesSection account={data} />
      <BenefitsSection account={data} />
      <TimelineSection account={data} />

      <Sheet open={editing} onClose={() => setEditing(false)} title={t("acct.edit")} wide>
        <AccountForm initial={data} onDone={() => setEditing(false)} />
      </Sheet>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2 py-1.5 dark:bg-slate-800/60">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium">{value ?? "—"}</dd>
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h3>
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
        <p className="text-sm text-slate-500">{t("detail.noBonuses")}</p>
      ) : (
        <ul className="space-y-3">
          {account.bonuses.map((b) => (
            <li key={b.id} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
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

export function BenefitItem({ b, showAccount, allowDelete }: { b: Benefit; showAccount?: boolean; allowDelete?: boolean }) {
  const [using, setUsing] = useState(false);
  const [amount, setAmount] = useState(String(b.remaining || b.amount));
  const [date, setDate] = useState(todayIso());
  const use = useMutate(() => api.post(`/benefits/${b.id}/uses`, { usedOn: date, amount: Number(amount) }));
  const undo = useMutate((useId: string) => api.del(`/benefit-uses/${useId}`));
  const del = useMutate(() => api.del(`/benefits/${b.id}`));
  return (
    <div className={cx("rounded-xl p-3", b.unused ? "bg-amber-50/70 dark:bg-amber-950/30" : "bg-slate-50 dark:bg-slate-800/60")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{b.name}</p>
          <p className="text-xs text-slate-500">
            {showAccount && b.accountLabel && <>{b.accountLabel} · </>}
            {td(`period.${b.period}`)} · {t("detail.periodEnds", { date: b.currentPeriod.end })}
          </p>
        </div>
        <Badge tone={b.unused ? "amber" : "green"}>{t("detail.used", { used: b.used, amount: b.amount })}</Badge>
      </div>
      <div className="mt-2">
        <ProgressBar ratio={b.amount ? b.used / b.amount : b.unused ? 0 : 1} tone={b.unused ? "amber" : "green"} />
      </div>
      {b.uses.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1">
          {b.uses
            .filter((u) => u.usedOn >= b.currentPeriod.start)
            .map((u) => (
              <li key={u.id}>
                <button className="rounded-md bg-white px-1.5 py-0.5 text-[11px] text-slate-600 ring-1 ring-slate-200 hover:line-through dark:bg-slate-900 dark:ring-slate-700" title="撤销" onClick={() => undo.mutate(u.id)}>
                  {u.usedOn} {fmtUsd(u.amount)} ✕
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
            <Button size="sm" onClick={() => setUsing(true)}>
              {t("detail.markUsed")}
            </Button>
            {allowDelete && (
              <Button size="sm" variant="danger" onClick={() => confirm(t("common.confirmDelete")) && del.mutate()}>
                {t("common.delete")}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function BenefitsSection({ account }: { account: Detail }) {
  const [adding, setAdding] = useState(false);
  return (
    <Section title={t("detail.benefits")} action={<Button size="sm" variant="ghost" onClick={() => setAdding(true)}>+ {t("detail.addBenefit")}</Button>}>
      {account.benefits.length === 0 ? (
        <p className="text-sm text-slate-500">{t("detail.noBenefits")}</p>
      ) : (
        <div className="space-y-2">
          {account.benefits.map((b) => (
            <BenefitItem key={b.id} b={b} allowDelete />
          ))}
        </div>
      )}
      <Sheet open={adding} onClose={() => setAdding(false)} title={t("detail.addBenefit")}>
        {adding && <BenefitForm accountId={account.id} onDone={() => setAdding(false)} />}
      </Sheet>
    </Section>
  );
}

function BenefitForm({ accountId, onDone }: { accountId: string; onDone: () => void }) {
  const [f, setF] = useState({ name: "", amount: "", period: "monthly", resetRule: "" });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const save = useMutate(() => api.post(`/accounts/${accountId}/benefits`, { name: f.name, amount: Number(f.amount || 0), period: f.period, resetRule: f.resetRule || null }));
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
      <Field label={t("benefit.amount")}>
        <Input type="number" min="0" step="0.01" value={f.amount} onChange={set("amount")} />
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
      <Field label={t("benefit.resetRule")} className="col-span-2">
        <Input value={f.resetRule} onChange={set("resetRule")} placeholder={t("common.optional")} />
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

// ---------------------------------------------------------------- Timeline

const eventTone = (type: EventType) =>
  type === "approved" || type === "bonus_earned" ? "bg-emerald-500" : type === "denied" || type === "closed" ? "bg-rose-500" : type === "note" ? "bg-slate-400" : "bg-indigo-500";

function TimelineSection({ account }: { account: Detail }) {
  const [adding, setAdding] = useState(false);
  const { data: products = [] } = useProducts();
  const name = (id: string | null) => products.find((p) => p.id === id)?.name ?? id;
  const del = useMutate((id: string) => api.del(`/events/${id}`));
  return (
    <Section title={t("detail.timeline")} action={<Button size="sm" variant="ghost" onClick={() => setAdding(true)}>+ {t("detail.addEvent")}</Button>}>
      {account.events.length === 0 ? (
        <p className="text-sm text-slate-500">{t("detail.noEvents")}</p>
      ) : (
        <ol className="relative ml-1.5 space-y-3 border-l border-slate-200 pl-4 dark:border-slate-700">
          {account.events.map((e) => (
            <li key={e.id} className="group relative">
              <span className={cx("absolute -left-[21.5px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-white dark:ring-slate-900", eventTone(e.type))} />
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">
                    {td(`event.${e.type}`)}
                    {e.toProductId && (
                      <span className="font-normal text-slate-500">
                        {" "}
                        {name(e.fromProductId)} → {name(e.toProductId)}
                      </span>
                    )}
                  </p>
                  <p className="tabular text-xs text-slate-500">{e.date}</p>
                  {e.note && <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">{e.note}</p>}
                </div>
                <button className="text-xs text-slate-400 opacity-60 hover:text-rose-600 group-hover:opacity-100" onClick={() => confirm(t("common.confirmDelete")) && del.mutate(e.id)} aria-label={t("common.delete")}>
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
