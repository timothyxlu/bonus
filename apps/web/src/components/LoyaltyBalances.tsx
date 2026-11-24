import { useMemo, useState, type FormEvent } from "react";
import { t, td } from "../i18n";
import { api } from "../lib/api";
import { useLoyaltyBalances, useMutate } from "../lib/queries";
import type { LoyaltyBalance, LoyaltyCategory } from "../lib/types";
import { IconPlus } from "./icons";
import { Badge, Button, Card, Empty, ErrorText, Field, Input, Select, Sheet, Spinner, Textarea } from "./ui";

export const LOYALTY_CATEGORIES: LoyaltyCategory[] = ["flight", "hotel", "credit_card"];
const formatPoints = new Intl.NumberFormat("en-US");
const categoryTone = (category: LoyaltyCategory) => category === "flight" ? "indigo" : category === "hotel" ? "green" : "amber";

export function LoyaltyBalances() {
  const { data = [], isLoading, error } = useLoyaltyBalances();
  const [editing, setEditing] = useState<LoyaltyBalance | "new" | null>(null);
  const remove = useMutate<string, { deleted: string }>((id) => api.del(`/loyalty-balances/${id}`));
  const grouped = useMemo(() => Object.fromEntries(LOYALTY_CATEGORIES.map((category) => [category, data.filter((row) => row.category === category)])) as Record<LoyaltyCategory, LoyaltyBalance[]>, [data]);

  return (
    <Card
      className="min-w-0 max-w-[calc(100vw-2rem)] overflow-hidden sm:max-w-none"
      title={<div className="min-w-0"><div>{t("loyalty.title")}</div><p className="mt-0.5 text-xs font-normal text-muted">{t("loyalty.subtitle")}</p></div>}
      action={<Button variant="primary" size="sm" onClick={() => setEditing("new")}><IconPlus /> <span className="hidden sm:inline">{t("loyalty.add")}</span></Button>}
    >
      {isLoading ? <Spinner /> : error ? <ErrorText error={error} /> : (
        <div className="grid gap-3 lg:grid-cols-3">
          {LOYALTY_CATEGORIES.map((category) => {
            const rows = grouped[category];
            const total = rows.reduce((sum, row) => sum + row.balance, 0);
            return (
              <section key={category} aria-labelledby={`loyalty-${category}`} className="min-w-0 overflow-hidden rounded-[var(--radius-control)] bg-sunken ring-1 ring-line ring-inset">
                <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5">
                  <h3 id={`loyalty-${category}`} className="font-medium"><Badge tone={categoryTone(category)}>{td(`loyalty.category.${category}`)}</Badge></h3>
                  <span className="hidden text-xs tabular-nums text-muted sm:inline">{t("loyalty.total", { n: formatPoints.format(total) })}</span>
                </div>
                {rows.length === 0 ? <Empty>{t("loyalty.empty")}</Empty> : (
                  <ul className="divide-y divide-line">
                    {rows.map((row) => (
                      <li key={row.id} className="flex min-h-14 items-center gap-2 bg-surface px-3 py-2">
                        <button type="button" onClick={() => setEditing(row)} className="min-w-0 flex-1 text-left">
                          <span className="block truncate text-sm font-medium text-ink">{row.program}</span>
                          {row.notes && <span className="block truncate text-xs text-muted">{row.notes}</span>}
                        </button>
                        <span className="shrink-0 text-sm font-semibold tabular-nums">{formatPoints.format(row.balance)}</span>
                        <span className="hidden sm:block"><Button size="sm" variant="ghost" aria-label={`${t("common.edit")} ${row.program}`} onClick={() => setEditing(row)}>{t("common.edit")}</Button></span>
                        <Button
                          size="sm"
                          variant="danger"
                          className="w-11 px-0 sm:w-auto sm:px-2.5"
                          aria-label={`${t("common.delete")} ${row.program}`}
                          disabled={remove.isPending}
                          onClick={() => { if (window.confirm(t("loyalty.confirmDelete"))) remove.mutate(row.id); }}
                        ><span className="sm:hidden" aria-hidden>×</span><span className="hidden sm:inline">{t("common.delete")}</span></Button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
      {remove.error && <ErrorText error={remove.error} />}
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? t("loyalty.add") : t("loyalty.edit")}>
        {editing && <LoyaltyBalanceForm initial={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} />}
      </Sheet>
    </Card>
  );
}

export function LoyaltyBalanceForm({ initial, onDone }: { initial?: LoyaltyBalance; onDone: () => void }) {
  const [category, setCategory] = useState<LoyaltyCategory>(initial?.category ?? "flight");
  const [program, setProgram] = useState(initial?.program ?? "");
  const [balance, setBalance] = useState(initial ? String(initial.balance) : "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [validation, setValidation] = useState("");
  const save = useMutate<Record<string, unknown>, LoyaltyBalance>((body) => initial ? api.patch(`/loyalty-balances/${initial.id}`, body) : api.post("/loyalty-balances", body));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = Number(balance);
    if (!Number.isSafeInteger(parsed) || parsed < 0) return setValidation(t("loyalty.validation.balance"));
    setValidation("");
    save.mutate({ category, program, balance: parsed, notes: notes.trim() || null }, { onSuccess: onDone });
  };

  return (
    <form className="space-y-4" onSubmit={submit}>
      <Field label={t("loyalty.category")}><Select value={category} onChange={(event) => setCategory(event.target.value as LoyaltyCategory)}>{LOYALTY_CATEGORIES.map((value) => <option value={value} key={value}>{td(`loyalty.category.${value}`)}</option>)}</Select></Field>
      <Field label={t("loyalty.program")}><Input required maxLength={120} value={program} onChange={(event) => setProgram(event.target.value)} /></Field>
      <Field label={t("loyalty.balance")} hint={validation || undefined}><Input required inputMode="numeric" min="0" step="1" value={balance} onChange={(event) => setBalance(event.target.value)} aria-invalid={!!validation} /></Field>
      <Field label={t("loyalty.notes")}><Textarea maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} /></Field>
      {save.error && <ErrorText error={save.error} />}
      <div className="flex justify-end gap-2"><Button type="button" onClick={onDone}>{t("common.cancel")}</Button><Button type="submit" variant="primary" disabled={save.isPending}>{t("common.save")}</Button></div>
    </form>
  );
}
