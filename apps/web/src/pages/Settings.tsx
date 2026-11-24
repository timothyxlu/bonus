import { useState } from "react";
import { Badge, Button, Card, ErrorText, Input, Select, Textarea } from "../components/ui";
import { t } from "../i18n";
import { api } from "../lib/api";
import { useMe, useMutate } from "../lib/queries";
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
      <div className="space-y-4">
        <Card title={t("settings.me")}>
          <p className="text-sm">
            {me.data?.email ?? "…"} {me.data && <Badge>{me.data.source}</Badge>}
          </p>
        </Card>
        <ImportCard />
      </div>
      <div className="space-y-4">
        <CatalogCard />
        <Card title={t("settings.mcp")}>
          <p className="text-sm text-muted">{t("settings.mcpHint")}</p>
          <code className="mt-2 block rounded-[var(--radius-control)] bg-sunken px-3 py-2 text-sm">{`${location.origin}/mcp`}</code>
        </Card>
      </div>
    </div>
  );
}

function ImportCard() {
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
        <div className="flex gap-2">
          <Input type="file" accept=".json,.csv,application/json,text/csv" onChange={(e) => onFile(e.target.files?.[0])} className="flex-1 py-1.5" />
          <Select value={type} onChange={(e) => setType(e.target.value as "json" | "csv")} className="w-24">
            <option value="json">JSON</option>
            <option value="csv">CSV</option>
          </Select>
        </div>
        <Textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} className="font-mono text-xs" placeholder='{"version":1,"accounts":[...]}' />
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
        <div className="flex justify-end gap-2">
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
