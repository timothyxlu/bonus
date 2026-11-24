/**
 * Card / gift-card secrets: masked by default, revealed for 30 s on request.
 * Revealed values live only in this component's state (never react-query cache,
 * localStorage or the service worker) and are cleared on timeout, tab hide or unmount.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { t, type MessageKey } from "../i18n";
import { api, ApiError } from "../lib/api";
import { Button, ErrorText, Field, Input, Sheet } from "./ui";

interface Meta {
  keyStatus: "ok" | "missing" | "invalid";
  supported: boolean;
  fieldNames: string[];
  stored: string[];
  updatedAt: string | null;
}

const LABEL: Record<string, MessageKey> = { pan: "sec.pan", exp: "sec.exp", cvv: "sec.cvv", number: "sec.number", pin: "sec.pin" };

function luhn(d: string) {
  let sum = 0;
  let dbl = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = d.charCodeAt(i) - 48;
    if (dbl) n = n * 2 > 9 ? n * 2 - 9 : n * 2;
    sum += n;
    dbl = !dbl;
  }
  return d.length > 0 && sum % 10 === 0;
}

function masked(field: string, last4: string | null) {
  if (field === "pan") return `•••• ${last4 ?? "••••"}`;
  if (field === "exp") return "••/••";
  if (field === "cvv") return "•••";
  return "••••••";
}

function pretty(field: string, v: string) {
  if (field !== "pan") return v;
  // Amex 15 digits: 4-6-5; others: groups of 4.
  if (v.length === 15) return `${v.slice(0, 4)} ${v.slice(4, 10)} ${v.slice(10)}`;
  return v.replace(/(\d{4})(?=\d)/g, "$1 ");
}

export function SecretSection({ accountId, kind, last4 }: { accountId: string; kind: string; last4: string | null }) {
  const qc = useQueryClient();
  const meta = useQuery({ queryKey: ["secret-meta", accountId], queryFn: () => api.get<Meta>(`/accounts/${accountId}/secret`) });
  const [values, setValues] = useState<Record<string, string> | null>(null);
  const [left, setLeft] = useState(0);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const hide = () => {
    setValues(null);
    setLeft(0);
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => {
    const onHidden = () => document.visibilityState === "hidden" && hide();
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      hide();
    };
  }, [accountId]);

  const reveal = async () => {
    setError(null);
    setBusy(true);
    try {
      const r = await api.post<{ values: Record<string, string>; revealSeconds: number }>(`/accounts/${accountId}/secret/reveal`);
      setValues(r.values);
      setLeft(r.revealSeconds);
      if (timer.current) clearInterval(timer.current);
      timer.current = setInterval(() => {
        setLeft((n) => {
          if (n <= 1) {
            hide();
            return 0;
          }
          return n - 1;
        });
      }, 1000);
    } catch (e) {
      setError(e as Error);
    } finally {
      setBusy(false);
    }
  };

  const copy = async (field: string) => {
    if (!values?.[field]) return;
    await navigator.clipboard.writeText(values[field]!);
    setCopied(field);
    setTimeout(() => setCopied(null), 1500);
  };

  const m = meta.data;
  if (!m || !m.supported) return null;
  const title = t(kind === "gift_card" ? "sec.title.gift_card" : "sec.title.credit_card");
  const disabled = m.keyStatus !== "ok";
  const apiErr = error instanceof ApiError ? error : null;

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        {!disabled && (
          <div className="flex items-center gap-1">
            {m.stored.length > 0 &&
              (values ? (
                <Button size="sm" variant="ghost" onClick={hide}>
                  {t("sec.hide")} <span className="tabular text-xs text-muted">{t("sec.hidingIn", { n: left })}</span>
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={reveal} disabled={busy}>
                  {t("sec.reveal")}
                </Button>
              ))}
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              {m.stored.length ? t("sec.edit") : t("sec.add")}
            </Button>
          </div>
        )}
      </div>
      {disabled ? (
        <p className="rounded-[var(--radius-control)] bg-warn-soft px-3 py-2 text-sm text-warn">{t(m.keyStatus === "missing" ? "sec.keyMissing" : "sec.keyInvalid")}</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-2">
            {m.fieldNames.map((f) => {
              const has = m.stored.includes(f);
              const v = values?.[f];
              return (
                <div key={f} className={`rounded-[var(--radius-row)] bg-sunken px-3 py-2 ${f === "pan" || f === "number" ? "col-span-2" : ""}`}>
                  <dt className="text-xs text-muted">{t(LABEL[f] ?? "sec.number")}</dt>
                  <dd className="flex items-center justify-between gap-2">
                    <span className="tabular font-mono text-sm whitespace-nowrap">{!has ? <span className="text-faint">{t("sec.notSet")}</span> : v ? pretty(f, v) : masked(f, last4)}</span>
                    {v && (
                      <button className="shrink-0 rounded px-2 py-1 text-xs font-medium text-brand hover:bg-brand-soft" onClick={() => copy(f)}>
                        {copied === f ? t("sec.copied") : t("sec.copy")}
                      </button>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
          <p className="mt-1.5 text-xs text-faint">{t("sec.encrypted")}</p>
        </>
      )}
      {apiErr?.code === "reauth_required" ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-[var(--radius-control)] bg-warn-soft px-3 py-2 text-sm text-warn">
          {t("sec.reauth")}
          <Button size="sm" onClick={() => (window.location.href = apiErr.reauthUrl ?? "/cdn-cgi/access/logout")}>
            {t("sec.reauthButton")}
          </Button>
        </div>
      ) : apiErr?.code === "rate_limited" ? (
        <p className="mt-2 text-sm text-warn">{t("sec.rateLimited")}</p>
      ) : (
        error && (
          <div className="mt-2">
            <ErrorText error={error} />
          </div>
        )
      )}
      <Sheet open={editing} onClose={() => setEditing(false)} title={title}>
        {editing && (
          <SecretForm
            accountId={accountId}
            kind={kind}
            fields={m.fieldNames}
            hasStored={m.stored.length > 0}
            onDone={() => {
              setEditing(false);
              hide();
              qc.invalidateQueries({ queryKey: ["secret-meta", accountId] });
              qc.invalidateQueries({ queryKey: ["account", accountId] });
              qc.invalidateQueries({ queryKey: ["accounts"] });
            }}
          />
        )}
      </Sheet>
    </section>
  );
}

function SecretForm({ accountId, kind, fields, hasStored, onDone }: { accountId: string; kind: string; fields: string[]; hasStored: boolean; onDone: () => void }) {
  const [f, setF] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const validate = (): string | null => {
    const pan = (f.pan ?? "").replace(/[\s-]/g, "");
    if (pan && (!/^\d{12,19}$/.test(pan) || !luhn(pan))) return t("sec.err.luhn");
    if (f.exp && !/^(0[1-9]|1[0-2])\/\d{2}$/.test(f.exp.trim())) return t("sec.err.exp");
    if (f.cvv && !/^\d{3,4}$/.test(f.cvv.trim())) return t("sec.err.cvv");
    return null;
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v = validate();
    setErr(v);
    if (v) return;
    const body = Object.fromEntries(Object.entries(f).filter(([, x]) => x.trim() !== ""));
    if (Object.keys(body).length === 0) return onDone();
    setBusy(true);
    try {
      await api.put(`/accounts/${accountId}/secret`, body);
      setF({});
      onDone();
    } catch (x) {
      setSaveErr(x);
    } finally {
      setBusy(false);
    }
  };
  const del = async () => {
    if (!confirm(t("sec.confirmDelete"))) return;
    await api.del(`/accounts/${accountId}/secret`);
    onDone();
  };
  const input = (name: string, props: Record<string, string | number> = {}) => (
    <Input
      name={`s-${name}-${accountId.slice(0, 6)}`}
      value={f[name] ?? ""}
      onChange={(e) => setF((x) => ({ ...x, [name]: e.target.value }))}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      data-1p-ignore
      data-lpignore="true"
      {...props}
    />
  );
  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-3" autoComplete="off">
      {kind === "credit_card" ? (
        <>
          <Field label={t("sec.pan")} className="col-span-2">
            {input("pan", { inputMode: "numeric", maxLength: 23, placeholder: "•••• •••• •••• ••••" })}
          </Field>
          <Field label={t("sec.exp")}>{input("exp", { inputMode: "numeric", maxLength: 5, placeholder: "MM/YY" })}</Field>
          <Field label={t("sec.cvv")}>{input("cvv", { inputMode: "numeric", maxLength: 4, placeholder: "•••" })}</Field>
        </>
      ) : (
        fields.map((name) => (
          <Field key={name} label={t(LABEL[name] ?? "sec.number")} className={name === "number" ? "col-span-2" : ""}>
            {input(name, { maxLength: name === "pin" ? 16 : 40 })}
          </Field>
        ))
      )}
      <p className="col-span-2 text-xs text-muted">{hasStored ? t("sec.keepBlank") : t("sec.encrypted")}</p>
      {err && <p className="col-span-2 rounded-[var(--radius-control)] bg-danger-soft px-3 py-2 text-sm text-danger">{err}</p>}
      <div className="col-span-2">
        <ErrorText error={saveErr} />
      </div>
      <div className="col-span-2 flex justify-between gap-2">
        {hasStored ? (
          <Button type="button" variant="danger" onClick={del}>
            {t("sec.deleteAll")}
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" variant="primary" disabled={busy}>
          {t("common.save")}
        </Button>
      </div>
    </form>
  );
}
