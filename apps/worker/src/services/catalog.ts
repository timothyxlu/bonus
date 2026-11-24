import { CATALOG_INSTITUTIONS, CATALOG_PRODUCTS } from "@bonus/core";
import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import type { z } from "zod";
import { institutions, products, type Product } from "../db/schema";
import type { institutionInput, productInput, productPatch } from "../schemas";
import { BadRequestError, NotFoundError, nowIso, type ServiceContext } from "./context";

const visible = (ownerCol: typeof products.ownerId | typeof institutions.ownerId, ownerId: string) =>
  or(isNull(ownerCol), eq(ownerCol, ownerId));

/** Upsert the generic catalog shipped with the code (idempotent). */
export async function syncCatalog(ctx: ServiceContext) {
  const { db } = ctx;
  const stmts = [
    ...CATALOG_INSTITUTIONS.map((i) =>
      db
        .insert(institutions)
        .values({ id: i.id, name: i.name, type: i.type, ownerId: null })
        .onConflictDoUpdate({ target: institutions.id, set: { name: i.name, type: i.type } }),
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
        .onConflictDoUpdate({ target: products.id, set: { ...row, updatedAt: nowIso() } });
    }),
  ];
  // D1 batch = single round trip, atomic.
  await db.batch(stmts as [ (typeof stmts)[number], ...(typeof stmts)[number][] ]);
  return { institutions: CATALOG_INSTITUTIONS.length, products: CATALOG_PRODUCTS.length };
}

/** Seed on first use so a fresh database is immediately usable. */
export async function ensureCatalog(ctx: ServiceContext) {
  const [row] = await ctx.db.select({ n: sql<number>`count(*)` }).from(products).where(isNull(products.ownerId));
  if (!row || row.n === 0) await syncCatalog(ctx);
}

export async function listInstitutions(ctx: ServiceContext) {
  return ctx.db
    .select()
    .from(institutions)
    .where(visible(institutions.ownerId, ctx.ownerId))
    .orderBy(asc(institutions.name));
}

export async function createInstitution(ctx: ServiceContext, input: z.infer<typeof institutionInput>) {
  const id = input.id ?? slug(input.name);
  const existing = await ctx.db.select().from(institutions).where(eq(institutions.id, id)).get();
  if (existing) throw new BadRequestError(`Institution id already exists: ${id}`);
  const [row] = await ctx.db
    .insert(institutions)
    .values({ id, ownerId: ctx.ownerId, name: input.name, type: input.type })
    .returning();
  return row!;
}

export async function listProducts(ctx: ServiceContext, filter: { kind?: string; institutionId?: string } = {}) {
  await ensureCatalog(ctx);
  const rows = await ctx.db
    .select({ product: products, institutionName: institutions.name })
    .from(products)
    .innerJoin(institutions, eq(products.institutionId, institutions.id))
    .where(
      and(
        visible(products.ownerId, ctx.ownerId),
        filter.kind ? eq(products.kind, filter.kind as Product["kind"]) : undefined,
        filter.institutionId ? eq(products.institutionId, filter.institutionId) : undefined,
      ),
    )
    .orderBy(asc(institutions.name), asc(products.name));
  return rows.map((r) => ({ ...r.product, institutionName: r.institutionName, isCatalog: r.product.ownerId === null }));
}

export async function getProduct(ctx: ServiceContext, id: string) {
  const row = await ctx.db
    .select()
    .from(products)
    .where(and(eq(products.id, id), visible(products.ownerId, ctx.ownerId)))
    .get();
  if (!row) throw new NotFoundError(`Product ${id}`);
  return row;
}

async function assertInstitution(ctx: ServiceContext, id: string) {
  const row = await ctx.db
    .select()
    .from(institutions)
    .where(and(eq(institutions.id, id), visible(institutions.ownerId, ctx.ownerId)))
    .get();
  if (!row) throw new BadRequestError(`Unknown institution: ${id}`);
  return row;
}

export async function createProduct(ctx: ServiceContext, input: z.infer<typeof productInput>) {
  await assertInstitution(ctx, input.institutionId);
  const id = input.id ?? `${input.institutionId}-${slug(input.name)}`.slice(0, 60);
  const existing = await ctx.db.select().from(products).where(eq(products.id, id)).get();
  if (existing) throw new BadRequestError(`Product id already exists: ${id}`);
  const [row] = await ctx.db
    .insert(products)
    .values({ ...input, id, ownerId: ctx.ownerId, family: input.family ?? null, network: input.network ?? null, currency: input.currency ?? null })
    .returning();
  return row!;
}

/** Only user-created products can be edited; catalog rows are managed by syncCatalog. */
export async function updateProduct(ctx: ServiceContext, id: string, patch: z.infer<typeof productPatch>) {
  const current = await getProduct(ctx, id);
  if (current.ownerId === null) throw new BadRequestError("Catalog products are read-only; create a custom product instead");
  if (patch.institutionId) await assertInstitution(ctx, patch.institutionId);
  const { id: _ignored, ...rest } = patch;
  const [row] = await ctx.db
    .update(products)
    .set({ ...rest, updatedAt: nowIso() })
    .where(and(eq(products.id, id), eq(products.ownerId, ctx.ownerId)))
    .returning();
  return row!;
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
