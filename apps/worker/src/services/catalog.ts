import { CATALOG_INSTITUTIONS, CATALOG_PRODUCTS, CATALOG_VERSION, type ProductRules } from "@bonus/core";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import type { z } from "zod";
import { accounts, appMeta, catalogOverrides, institutions, products, type CatalogOverride, type Institution, type Product } from "../db/schema";
import type { institutionInput, institutionPatch, productInput, productPatch } from "../schemas";
import { BadRequestError, NotFoundError, nowIso, type ServiceContext } from "./context";

/*
 * Catalog model
 * - Seeded rows (owner_id NULL) are shared defaults, refreshed by syncCatalog once per CATALOG_VERSION.
 * - An owner edits a seeded row through catalog_overrides (merged on read) - never in place - so
 *   re-syncs cannot clobber edits and other owners are unaffected.
 * - Owner-created rows (owner_id set) are edited in place; the seed upsert never touches them.
 * - Products are archived, never hard-deleted (accounts and history may reference them).
 */

export type CatalogProduct = Product & {
  institutionName: string;
  isCatalog: boolean;
  customized: boolean;
  archived: boolean;
};
export type CatalogInstitution = Institution & { isCatalog: boolean; customized: boolean };

const visible = (ownerCol: typeof products.ownerId | typeof institutions.ownerId, ownerId: string) =>
  or(isNull(ownerCol), eq(ownerCol, ownerId));

// ---------------------------------------------------------------- seed sync

let syncedVersion: number | null = null;

/** Upsert the generic catalog shipped with the code (idempotent; owner rows and overrides untouched). */
export async function syncCatalog(ctx: ServiceContext) {
  const { db } = ctx;
  const stmts = [
    ...CATALOG_INSTITUTIONS.map((i) =>
      db
        .insert(institutions)
        .values({ id: i.id, name: i.name, type: i.type, ownerId: null })
        .onConflictDoUpdate({ target: institutions.id, set: { name: i.name, type: i.type }, setWhere: isNull(institutions.ownerId) }),
    ),
    ...CATALOG_PRODUCTS.map((p) => {
      const row = {
        institutionId: p.institutionId,
        name: p.name,
        kind: p.kind,
        ownerType: p.ownerType,
        family: p.family,
        annualFee: p.annualFee,
        network: p.network,
        currency: p.currency,
        rules: p.rules,
      };
      return db
        .insert(products)
        .values({ id: p.id, ownerId: null, ...row })
        .onConflictDoUpdate({ target: products.id, set: { ...row, updatedAt: nowIso() }, setWhere: isNull(products.ownerId) });
    }),
    db
      .insert(appMeta)
      .values({ key: "catalog_version", value: String(CATALOG_VERSION) })
      .onConflictDoUpdate({ target: appMeta.key, set: { value: String(CATALOG_VERSION) } }),
  ];
  await db.batch(stmts as [(typeof stmts)[number], ...(typeof stmts)[number][]]);
  syncedVersion = CATALOG_VERSION;
  return { institutions: CATALOG_INSTITUTIONS.length, products: CATALOG_PRODUCTS.length, version: CATALOG_VERSION };
}

/** Seed on first use and re-sync when the shipped catalog version changes. */
export async function ensureCatalog(ctx: ServiceContext) {
  if (syncedVersion === CATALOG_VERSION) return;
  const row = await ctx.db.select().from(appMeta).where(eq(appMeta.key, "catalog_version")).get();
  if (row?.value === String(CATALOG_VERSION)) {
    syncedVersion = CATALOG_VERSION;
    return;
  }
  await syncCatalog(ctx);
}

/** Test hook: forget the in-memory sync marker. */
export function _resetCatalogCache() {
  syncedVersion = null;
}

// ---------------------------------------------------------------- merged views

async function overridesFor(ctx: ServiceContext, entity: "product" | "institution") {
  const rows = await ctx.db
    .select()
    .from(catalogOverrides)
    .where(and(eq(catalogOverrides.ownerId, ctx.ownerId), eq(catalogOverrides.entity, entity)));
  return new Map(rows.map((r) => [r.entityId, r]));
}

function mergeInstitution(i: Institution, o?: CatalogOverride): CatalogInstitution {
  const d = (o?.data ?? {}) as Partial<Institution>;
  return { ...i, ...pick(d, ["name", "type"]), isCatalog: i.ownerId === null, customized: !!o };
}

function mergeProduct(p: Product, o: CatalogOverride | undefined, instName: (id: string) => string): CatalogProduct {
  const d = (o?.data ?? {}) as Partial<Product>;
  const merged = { ...p, ...pick(d, ["name", "institutionId", "kind", "ownerType", "family", "annualFee", "network", "currency", "rules"]) } as Product;
  return {
    ...merged,
    institutionName: instName(merged.institutionId),
    isCatalog: p.ownerId === null,
    customized: !!o && Object.keys(d).length > 0,
    archived: p.ownerId === null ? !!o?.archived : !!p.archivedAt,
  };
}

function pick<T extends object>(o: T, keys: string[]): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in o) out[k] = (o as Record<string, unknown>)[k];
  return out as Partial<T>;
}

/** Everything visible to the owner, merged with their overrides. Cached per request context. */
const viewCache = new WeakMap<ServiceContext, Promise<{ products: Map<string, CatalogProduct>; institutions: Map<string, CatalogInstitution> }>>();

export function catalogView(ctx: ServiceContext) {
  let v = viewCache.get(ctx);
  if (!v) {
    v = (async () => {
      await ensureCatalog(ctx);
      const [instRows, prodRows, instOv, prodOv] = await Promise.all([
        ctx.db.select().from(institutions).where(visible(institutions.ownerId, ctx.ownerId)),
        ctx.db.select().from(products).where(visible(products.ownerId, ctx.ownerId)),
        overridesFor(ctx, "institution"),
        overridesFor(ctx, "product"),
      ]);
      const insts = new Map(instRows.map((i) => [i.id, mergeInstitution(i, instOv.get(i.id))]));
      const name = (id: string) => insts.get(id)?.name ?? id;
      const prods = new Map(prodRows.map((p) => [p.id, mergeProduct(p, prodOv.get(p.id), name)]));
      return { products: prods, institutions: insts };
    })();
    viewCache.set(ctx, v);
  }
  return v;
}

/** Call after a catalog write so later reads in the same request see it. */
export function invalidateCatalog(ctx: ServiceContext) {
  invalidate(ctx);
}
function invalidate(ctx: ServiceContext) {
  viewCache.delete(ctx);
}

// ---------------------------------------------------------------- institutions

export async function listInstitutions(ctx: ServiceContext) {
  const v = await catalogView(ctx);
  return [...v.institutions.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function requireInstitution(ctx: ServiceContext, id: string) {
  const i = (await catalogView(ctx)).institutions.get(id);
  if (!i) throw new BadRequestError(`Unknown institution: ${id}`);
  return i;
}

export async function createInstitution(ctx: ServiceContext, input: z.infer<typeof institutionInput>) {
  await ensureCatalog(ctx);
  const id = input.id ?? slug(input.name).replace(/-/g, "_");
  const existing = await ctx.db.select().from(institutions).where(eq(institutions.id, id)).get();
  if (existing) throw new BadRequestError(`Institution id already exists: ${id} (${existing.name})`);
  const [row] = await ctx.db.insert(institutions).values({ id, ownerId: ctx.ownerId, name: input.name, type: input.type }).returning();
  invalidate(ctx);
  return { ...row!, isCatalog: false, customized: false };
}

/** Owner rows are edited in place; seeded rows get an override. */
export async function updateInstitution(ctx: ServiceContext, id: string, patch: z.infer<typeof institutionPatch>) {
  const current = await requireInstitution(ctx, id);
  if (current.isCatalog) await upsertOverride(ctx, "institution", id, patch);
  else await ctx.db.update(institutions).set(patch).where(and(eq(institutions.id, id), eq(institutions.ownerId, ctx.ownerId)));
  invalidate(ctx);
  return requireInstitution(ctx, id);
}

// ---------------------------------------------------------------- products

export interface ProductFilter {
  kind?: string;
  institutionId?: string;
  /** Include archived products (default false). History and account views pass true. */
  includeArchived?: boolean;
  q?: string;
}

export async function listProducts(ctx: ServiceContext, filter: ProductFilter = {}) {
  const v = await catalogView(ctx);
  const q = filter.q?.trim().toLowerCase();
  return [...v.products.values()]
    .filter(
      (p) =>
        (filter.includeArchived || !p.archived) &&
        (!filter.kind || p.kind === filter.kind) &&
        (!filter.institutionId || p.institutionId === filter.institutionId) &&
        (!q || [p.id, p.name, p.institutionName, p.family ?? ""].some((s) => s.toLowerCase().includes(q))),
    )
    .sort((a, b) => a.institutionName.localeCompare(b.institutionName) || a.name.localeCompare(b.name));
}

/** A product visible to the owner (merged), archived or not. */
export async function getProduct(ctx: ServiceContext, id: string) {
  const p = (await catalogView(ctx)).products.get(id);
  if (!p) throw new NotFoundError(`Product ${id}`);
  return p;
}

/** For new accounts / product changes / offers: must exist and not be archived. */
export async function getActiveProduct(ctx: ServiceContext, id: string) {
  const p = await getProduct(ctx, id);
  if (p.archived) throw new BadRequestError(`Product ${id} is archived; unarchive it first`);
  return p;
}

export async function createProduct(ctx: ServiceContext, input: z.infer<typeof productInput>) {
  await requireInstitution(ctx, input.institutionId);
  const id = input.id ?? `${input.institutionId.replace(/_/g, "-")}-${slug(input.name)}`.slice(0, 60);
  const existing = await ctx.db.select().from(products).where(eq(products.id, id)).get();
  if (existing) throw new BadRequestError(`Product id already exists: ${id} (${existing.name}); pass a different id`);
  await ctx.db.insert(products).values({
    ...input,
    id,
    ownerId: ctx.ownerId,
    family: input.family ?? null,
    network: input.network ?? null,
    currency: input.currency ?? null,
    rules: cleanRules(input.rules ?? {}),
  });
  invalidate(ctx);
  return getProduct(ctx, id);
}

function cleanRules(r: Record<string, unknown>): ProductRules {
  return Object.fromEntries(Object.entries(r).filter(([, v]) => v !== null && v !== undefined)) as ProductRules;
}

/** Owner products are edited in place; seeded products get a per-owner override. */
export async function updateProduct(ctx: ServiceContext, id: string, patch: z.infer<typeof productPatch>) {
  const current = await getProduct(ctx, id);
  if (patch.institutionId) await requireInstitution(ctx, patch.institutionId);
  if (patch.kind && patch.kind !== current.kind) {
    const used = await ctx.db.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.ownerId, ctx.ownerId), eq(accounts.productId, id))).limit(1);
    if (used.length) throw new BadRequestError("Cannot change the kind of a product that accounts already use");
  }
  const { rules: rulesPatch, ...fields } = patch;
  const next: Record<string, unknown> = { ...fields };
  if (rulesPatch) next.rules = cleanRules({ ...(current.rules ?? {}), ...rulesPatch });

  if (current.isCatalog) {
    await upsertOverride(ctx, "product", id, next);
  } else {
    await ctx.db
      .update(products)
      .set({ ...(next as Partial<Product>), updatedAt: nowIso() })
      .where(and(eq(products.id, id), eq(products.ownerId, ctx.ownerId)));
  }
  invalidate(ctx);
  return getProduct(ctx, id);
}

export async function archiveProduct(ctx: ServiceContext, id: string, archived = true) {
  const current = await getProduct(ctx, id);
  if (current.isCatalog) {
    await ctx.db
      .insert(catalogOverrides)
      .values({ ownerId: ctx.ownerId, entity: "product", entityId: id, data: {}, archived })
      .onConflictDoUpdate({ target: [catalogOverrides.ownerId, catalogOverrides.entity, catalogOverrides.entityId], set: { archived, updatedAt: nowIso() } });
  } else {
    await ctx.db
      .update(products)
      .set({ archivedAt: archived ? nowIso() : null, updatedAt: nowIso() })
      .where(and(eq(products.id, id), eq(products.ownerId, ctx.ownerId)));
  }
  invalidate(ctx);
  return getProduct(ctx, id);
}

/** Drop an owner's edits to a seeded product or institution (back to the shipped defaults). */
export async function resetOverride(ctx: ServiceContext, entity: "product" | "institution", id: string) {
  await ctx.db
    .delete(catalogOverrides)
    .where(and(eq(catalogOverrides.ownerId, ctx.ownerId), eq(catalogOverrides.entity, entity), eq(catalogOverrides.entityId, id)));
  invalidate(ctx);
  return entity === "product" ? getProduct(ctx, id) : requireInstitution(ctx, id);
}

async function upsertOverride(ctx: ServiceContext, entity: "product" | "institution", id: string, data: Record<string, unknown>) {
  const existing = await ctx.db
    .select()
    .from(catalogOverrides)
    .where(and(eq(catalogOverrides.ownerId, ctx.ownerId), eq(catalogOverrides.entity, entity), eq(catalogOverrides.entityId, id)))
    .get();
  const merged = { ...(existing?.data ?? {}), ...data };
  await ctx.db
    .insert(catalogOverrides)
    .values({ ownerId: ctx.ownerId, entity, entityId: id, data: merged })
    .onConflictDoUpdate({ target: [catalogOverrides.ownerId, catalogOverrides.entity, catalogOverrides.entityId], set: { data: merged, updatedAt: nowIso() } });
}

export function slug(s: string) {
  return (
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "item"
  );
}

/** Count accounts using a product (shown in the 产品库). */
export async function productUsage(ctx: ServiceContext) {
  const rows = await ctx.db
    .select({ productId: accounts.productId, n: sql<number>`count(*)` })
    .from(accounts)
    .where(eq(accounts.ownerId, ctx.ownerId))
    .groupBy(accounts.productId);
  return new Map(rows.filter((r) => r.productId).map((r) => [r.productId!, r.n]));
}


