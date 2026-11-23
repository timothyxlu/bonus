import { useState } from "react";
import { Badge, Button, Card, ErrorText, Field, Input, Select, Textarea } from "../components/ui";
import { t } from "../i18n";
import { api } from "../lib/api";
import { useInstitutions, useMe, useMutate } from "../lib/queries";

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
          <p className="text-sm text-slate-600 dark:text-slate-400">{t("settings.mcpHint")}</p>
          <code className="mt-2 block rounded-lg bg-slate-100 px-3 py-2 text-sm dark:bg-slate-800">{`${location.origin}/mcp`}</code>
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
      <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">{t("settings.importHint")}</p>
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
          <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800">
            <p className="font-medium">
              {result.dryRun ? "[dry run] " : ""}
              {t("settings.importResult", { created: result.created, skipped: result.skipped.length, errors: result.errors.length })}
            </p>
            {[...result.errors.map((e) => `#${e.index + 1}: ${e.error}`), ...result.skipped.map((s) => `#${s.index + 1}: ${s.reason}`)].map((l) => (
              <p key={l} className="mt-1 text-xs text-slate-600 dark:text-slate-400">
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
  const { data: institutions = [] } = useInstitutions();
  const [msg, setMsg] = useState("");
  const sync = useMutate(() => api.post<{ products: number }>("/catalog/sync"));
  const [f, setF] = useState({ institutionId: "", name: "", ownerType: "personal", annualFee: "", family: "" });
  const create = useMutate(() =>
    api.post("/products", { institutionId: f.institutionId, name: f.name, ownerType: f.ownerType, annualFee: Number(f.annualFee || 0), family: f.family || null }),
  );
  return (
    <Card title={t("settings.catalog")} action={<Button size="sm" onClick={() => sync.mutate(undefined, { onSuccess: (r) => setMsg(t("settings.synced", { n: r.products })) })}>{t("settings.syncCatalog")}</Button>}>
      {msg && <p className="mb-2 text-sm text-emerald-600">{msg}</p>}
      <form
        className="grid grid-cols-2 gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate(undefined, { onSuccess: () => setF((s) => ({ ...s, name: "", annualFee: "", family: "" })) });
        }}
      >
        <p className="col-span-2 text-xs font-semibold text-slate-500">{t("settings.customProduct")}</p>
        <Field label={t("acct.institution")}>
          <Select value={f.institutionId} onChange={(e) => setF((s) => ({ ...s, institutionId: e.target.value }))} required>
            <option value="">—</option>
            {institutions.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("settings.productName")}>
          <Input value={f.name} onChange={(e) => setF((s) => ({ ...s, name: e.target.value }))} required />
        </Field>
        <Field label={t("acct.ownerType")}>
          <Select value={f.ownerType} onChange={(e) => setF((s) => ({ ...s, ownerType: e.target.value }))}>
            <option value="personal">{t("ownerType.personal")}</option>
            <option value="business">{t("ownerType.business")}</option>
          </Select>
        </Field>
        <Field label={t("acct.col.fee")}>
          <Input type="number" min="0" value={f.annualFee} onChange={(e) => setF((s) => ({ ...s, annualFee: e.target.value }))} />
        </Field>
        <Field label={t("settings.family")} className="col-span-2">
          <Input value={f.family} onChange={(e) => setF((s) => ({ ...s, family: e.target.value }))} placeholder="chase_sapphire / amex_mr_charge / …" />
        </Field>
        <div className="col-span-2">
          <ErrorText error={create.error ?? sync.error} />
        </div>
        <div className="col-span-2 flex justify-end">
          <Button type="submit" variant="primary" disabled={create.isPending}>
            {t("common.add")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
