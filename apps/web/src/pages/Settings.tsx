import { browserSupportsWebAuthn, startRegistration, type PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { US_STATES, usStateName } from "@bonus/core";
import { useId, useState } from "react";
import { InstallCard } from "../components/InstallApp";
import { Badge, Button, Card, ErrorText, Input, Select, Textarea } from "../components/ui";
import { t } from "../i18n";
import { api, ApiError } from "../lib/api";
import { useMe, useMutate, usePreferences, useUpdatePreferences } from "../lib/queries";
import { Link } from "../lib/router";

interface ImportResult {
  dryRun: boolean;
  created: number;
  skipped: { index: number; reason: string }[];
  errors: { index: number; error: string }[];
}

export function SettingsPage() {
  const me = useMe();
  return (
    <div className="grid grid-cols-1 gap-4 lg:gap-6 xl:grid-cols-2">
      <div className="min-w-0 space-y-4">
        <Card title={t("settings.me")}>
          <p className="text-sm">
            {me.data?.email ?? "…"} {me.data && <Badge>{me.data.source}</Badge>}
          </p>
        </Card>
        <HomeStateCard />
        <BiometricCard />
        <InstallCard />
        <ImportCard />
      </div>
      <div className="min-w-0 space-y-4">
        <CatalogCard />
        <Card title={t("settings.mcp")}>
          <p className="text-sm text-muted">{t("settings.mcpHint")}</p>
          <code className="mt-2 block rounded-[var(--radius-control)] bg-sunken px-3 py-2 text-sm">{`${location.origin}/mcp`}</code>
        </Card>
      </div>
    </div>
  );
}

/** The user's U.S. state, saved to their account as soon as it is picked. "" = not set. */
export function HomeStateCard() {
  const id = useId();
  const prefs = usePreferences();
  const update = useUpdatePreferences();
  const [notice, setNotice] = useState("");
  // While a save is in flight show the chosen value; otherwise the server's (so a failed save reverts).
  const value = update.isPending ? (update.variables?.homeState ?? "") : (prefs.data?.homeState ?? "");

  const onChange = (next: string) => {
    setNotice("");
    update.mutate(
      { homeState: next || null },
      {
        onSuccess: (saved) => {
          const name = usStateName(saved.homeState);
          setNotice(name ? t("settings.homeStateSaved", { name }) : t("settings.homeStateCleared"));
        },
      },
    );
  };

  return (
    <Card title={t("settings.homeState")}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-muted">
        {t("settings.homeStateLabel")}
      </label>
      <Select
        id={id}
        name="homeState"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={!prefs.data || update.isPending}
        aria-describedby={`${id}-hint`}
        className="w-full min-w-0 sm:max-w-xs"
      >
        <option value="">{t("settings.homeStateNotSet")}</option>
        {US_STATES.map((s) => (
          <option key={s.code} value={s.code}>
            {`${s.name} (${s.code})`}
          </option>
        ))}
      </Select>
      <p id={`${id}-hint`} className="mt-2 text-sm text-muted">
        {t("settings.homeStateHint")}
      </p>
      <p role="status" aria-live="polite" className={`mt-2 text-sm empty:hidden ${update.isPending ? "text-muted" : "text-money"}`}>
        {update.isPending ? t("settings.homeStateSaving") : notice}
      </p>
      <div className="mt-2 empty:hidden">
        <ErrorText error={update.error ?? prefs.error} />
      </div>
    </Card>
  );
}

interface WebAuthnStatus {
  configured: boolean;
  credentials: { id: string; deviceType: string; backedUp: boolean; createdAt: string; lastUsedAt: string | null }[];
}

function BiometricCard() {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ["webauthn-status"], queryFn: () => api.get<WebAuthnStatus>("/webauthn/status") });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const supported = browserSupportsWebAuthn();
  const reauth = error instanceof ApiError && error.code === "reauth_required" ? error : null;

  const register = async () => {
    setBusy(true);
    setError(null);
    try {
      const options = await api.post<PublicKeyCredentialCreationOptionsJSON>("/webauthn/register/options");
      const response = await startRegistration({ optionsJSON: options });
      await api.post<WebAuthnStatus>("/webauthn/register/verify", response);
      await qc.invalidateQueries({ queryKey: ["webauthn-status"] });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm(t("settings.biometricRemoveConfirm"))) return;
    setBusy(true);
    setError(null);
    try {
      await api.del(`/webauthn/credentials/${encodeURIComponent(id)}`);
      await qc.invalidateQueries({ queryKey: ["webauthn-status"] });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title={t("settings.biometric")}
      action={
        supported && (
          <Button size="sm" onClick={register} disabled={busy}>
            {status.data?.configured ? t("settings.biometricAdd") : t("settings.biometricSetup")}
          </Button>
        )
      }
    >
      <p className="text-sm text-muted">{t("settings.biometricHint")}</p>
      {!supported && <p className="mt-2 text-sm text-warn">{t("settings.biometricUnsupported")}</p>}
      {status.data?.credentials.map((credential) => (
        <div key={credential.id} className="mt-3 flex items-center justify-between gap-3 rounded-[var(--radius-row)] bg-sunken px-3 py-2">
          <div>
            <p className="text-sm font-medium">{t("settings.biometricDevice")}</p>
            <p className="text-xs text-muted">
              {t("settings.biometricAdded", { date: new Date(credential.createdAt).toLocaleDateString("zh-CN") })}
              {credential.lastUsedAt ? ` · ${t("settings.biometricLastUsed", { date: new Date(credential.lastUsedAt).toLocaleDateString("zh-CN") })}` : ""}
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => remove(credential.id)} disabled={busy}>
            {t("common.delete")}
          </Button>
        </div>
      ))}
      {status.data && !status.data.configured && supported && <p className="mt-2 text-sm text-warn">{t("settings.biometricNotConfigured")}</p>}
      {reauth ? (
        <div className="mt-2 flex items-center gap-2 text-sm text-warn">
          {t("sec.reauth")}
          <Button size="sm" onClick={() => (window.location.href = reauth.reauthUrl ?? "/cdn-cgi/access/logout")}>
            {t("sec.reauthButton")}
          </Button>
        </div>
      ) : (
        <ErrorText error={error ?? status.error} />
      )}
    </Card>
  );
}

export function ImportCard() {
  const [text, setText] = useState("");
  const [type, setType] = useState<"json" | "csv">("json");
  const [result, setResult] = useState<ImportResult | null>(null);
  const run = useMutate(async (dryRun: boolean) =>
    type === "csv"
      ? api.postRaw<ImportResult>(`/import?dryRun=${dryRun ? 1 : 0}`, text, "text/csv")
      : api.post<ImportResult>(`/import?dryRun=${dryRun ? 1 : 0}`, JSON.parse(text)),
  );
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setType(f.name.toLowerCase().endsWith(".csv") ? "csv" : "json");
    setText(await f.text());
    setResult(null);
  };
  const go = (dryRun: boolean) => run.mutate(dryRun, { onSuccess: (r) => setResult(r) });
  return (
    <Card title={t("settings.import")}>
      <p className="mb-3 text-sm text-muted">{t("settings.importHint")}</p>
      <div className="space-y-3">
        <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_6rem]">
          <Input type="file" accept=".json,.csv,application/json,text/csv" onChange={(e) => onFile(e.target.files?.[0])} className="w-full min-w-0 py-1.5" />
          <Select value={type} onChange={(e) => setType(e.target.value as "json" | "csv")} className="w-full min-w-0">
            <option value="json">JSON</option>
            <option value="csv">CSV</option>
          </Select>
        </div>
        <Textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} className="w-full min-w-0 font-mono text-xs" placeholder='{"version":1,"accounts":[...]}' />
        <ErrorText error={run.error} />
        {result && (
          <div className="rounded-[var(--radius-control)] bg-sunken p-3 text-sm">
            <p className="font-medium">
              {result.dryRun ? "[dry run] " : ""}
              {t("settings.importResult", { created: result.created, skipped: result.skipped.length, errors: result.errors.length })}
            </p>
            {[...result.errors.map((e) => `#${e.index + 1}: ${e.error}`), ...result.skipped.map((s) => `#${s.index + 1}: ${s.reason}`)].map((l) => (
              <p key={l} className="mt-1 text-xs text-muted">
                {l}
              </p>
            ))}
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={() => go(true)} disabled={!text || run.isPending}>
            {t("settings.dryRun")}
          </Button>
          <Button variant="primary" onClick={() => go(false)} disabled={!text || run.isPending}>
            {t("settings.doImport")}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function CatalogCard() {
  const [msg, setMsg] = useState("");
  const sync = useMutate(() => api.post<{ products: number }>("/catalog/sync"));
  return (
    <Card
      title={t("settings.catalog")}
      action={
        <Button size="sm" onClick={() => sync.mutate(undefined, { onSuccess: (r) => setMsg(t("settings.synced", { n: r.products })) })}>
          {t("settings.syncCatalog")}
        </Button>
      }
    >
      {msg && <p className="mb-2 text-sm text-money">{msg}</p>}
      <ErrorText error={sync.error} />
      <p className="text-sm text-muted">{t("cat2.subtitle")}</p>
      <Link to="/catalog" className="mt-2 inline-flex min-h-10 items-center text-sm font-medium text-brand hover:underline">
        {t("cat2.manage")}
      </Link>
    </Card>
  );
}
