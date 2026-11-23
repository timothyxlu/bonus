import { eq } from "drizzle-orm";
import { accounts, bonuses, benefits, events, institutions } from "../db/schema";
import { importPayload, type ImportPayload } from "../schemas";
import { createAccount } from "./accounts";
import { listInstitutions, listProducts, slug } from "./catalog";
import { BadRequestError, newId, type ServiceContext } from "./context";

export interface ImportResult {
  dryRun: boolean;
  created: number;
  skipped: { index: number; reason: string }[];
  errors: { index: number; error: string }[];
  createdIds: string[];
}

/**
 * Bulk-import account history (owner's real data arrives this way - never via git).
 * Idempotent-ish: an account with the same product, open date and last4 is skipped.
 */
export async function importHistory(ctx: ServiceContext, raw: unknown, opts: { dryRun?: boolean } = {}): Promise<ImportResult> {
  const parsed = importPayload.safeParse(raw);
  if (!parsed.success) throw new BadRequestError(`Invalid import payload: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  const payload: ImportPayload = parsed.data;
  const products = await listProducts(ctx);
  const insts = await listInstitutions(ctx);
  const existing = await ctx.db.select().from(accounts).where(eq(accounts.ownerId, ctx.ownerId));
  const result: ImportResult = { dryRun: !!opts.dryRun, created: 0, skipped: [], errors: [], createdIds: [] };

  for (const [index, item] of payload.accounts.entries()) {
    try {
      let productId = item.productId ?? null;
      if (!productId && item.product) {
        const key = item.product.toLowerCase().trim();
        const match =
          products.find((p) => p.id === key) ??
          products.find((p) => p.name.toLowerCase() === key) ??
          products.find((p) => `${p.institutionName} ${p.name}`.toLowerCase() === key);
        productId = match?.id ?? null;
      }
      let institutionId = item.institutionId ?? null;
      if (!productId && !institutionId) {
        const issuer = item.issuer?.trim();
        if (!issuer) throw new Error(`Unknown product "${item.product ?? ""}" and no issuer given`);
        const inst = insts.find((i) => i.id === issuer.toLowerCase() || i.name.toLowerCase() === issuer.toLowerCase());
        if (inst) institutionId = inst.id;
        else if (!opts.dryRun) {
          const id = slug(issuer).replace(/-/g, "_");
          await ctx.db.insert(institutions).values({ id, ownerId: ctx.ownerId, name: issuer, type: "issuer" }).onConflictDoNothing();
          insts.push({ id, ownerId: ctx.ownerId, name: issuer, type: "issuer", createdAt: "" });
          institutionId = id;
        } else institutionId = "(new)";
      }
      const dup = existing.find(
        (a) =>
          a.productId === productId &&
          (productId !== null || a.institutionId === institutionId) &&
          a.openedAt === (item.openedAt ?? null) &&
          a.last4 === (item.last4 ?? null),
      );
      if (dup) {
        result.skipped.push({ index, reason: `Duplicate of existing account ${dup.id}` });
        continue;
      }
      if (opts.dryRun) {
        result.created++;
        continue;
      }
      const created = await createAccount(
        ctx,
        { ...item, productId, institutionId: productId ? null : institutionId },
        { autoEvents: item.events.length === 0 },
      );
      const stmts: any[] = [];
      for (const e of item.events)
        stmts.push(ctx.db.insert(events).values({ id: newId(), ownerId: ctx.ownerId, accountId: created.id, type: e.type, date: e.date, fromProductId: e.fromProductId ?? null, toProductId: e.toProductId ?? null, note: e.note ?? null, data: e.data }));
      for (const b of item.bonuses)
        stmts.push(ctx.db.insert(bonuses).values({ ...b, id: newId(), ownerId: ctx.ownerId, accountId: created.id, productId: b.productId ?? productId }));
      for (const b of item.benefits) stmts.push(ctx.db.insert(benefits).values({ ...b, id: newId(), ownerId: ctx.ownerId, accountId: created.id }));
      if (stmts.length) await ctx.db.batch(stmts as [any, ...any[]]);
      existing.push(created);
      result.created++;
      result.createdIds.push(created.id);
    } catch (err) {
      result.errors.push({ index, error: (err as Error).message });
    }
  }
  return result;
}

/**
 * CSV import. Header row required. Columns (any order):
 * product, issuer, kind, owner_type, nickname, last4, status, applied_at, opened_at, closed_at,
 * is_authorized_user, bonus_earned_at, notes
 */
export function csvToImportPayload(csv: string): unknown {
  const rows = parseCsv(csv.trim());
  if (rows.length < 1) throw new BadRequestError("CSV is empty");
  const header = rows[0]!.map((h) => h.trim().toLowerCase());
  const get = (r: string[], k: string) => {
    const i = header.indexOf(k);
    const v = i >= 0 ? r[i]?.trim() : undefined;
    return v === "" ? undefined : v;
  };
  return {
    version: 1,
    accounts: rows.slice(1).filter((r) => r.some((c) => c.trim() !== "")).map((r) => {
      const bonusEarned = get(r, "bonus_earned_at");
      return {
        product: get(r, "product"),
        issuer: get(r, "issuer"),
        kind: get(r, "kind") ?? "credit_card",
        ownerType: get(r, "owner_type"),
        nickname: get(r, "nickname"),
        last4: get(r, "last4"),
        status: get(r, "status") ?? (get(r, "closed_at") ? "closed" : "open"),
        appliedAt: get(r, "applied_at"),
        openedAt: get(r, "opened_at"),
        closedAt: get(r, "closed_at"),
        isAuthorizedUser: ["1", "true", "yes", "y"].includes((get(r, "is_authorized_user") ?? "").toLowerCase()),
        notes: get(r, "notes"),
        bonuses: bonusEarned ? [{ status: "posted", earnedAt: bonusEarned, description: "Imported" }] : [],
      };
    }),
  };
}

/** Minimal RFC 4180 CSV parser (quotes, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  row.push(field);
  rows.push(row);
  return rows;
}
