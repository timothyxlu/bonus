import { and, asc, eq } from "drizzle-orm";
import type { z } from "zod";
import { accounts, benefits, hotelCertificates, products } from "../db/schema";
import type { hotelCertificateInput, hotelCertificatePatch } from "../schemas";
import { accountLabel } from "./accounts";
import { catalogView } from "./catalog";
import { BadRequestError, NotFoundError, newId, nowIso, type ServiceContext } from "./context";

export type HotelCertificateStatus = "unused" | "used" | "expired";

async function requireAccount(ctx: ServiceContext, id: string) {
  const row = await ctx.db.select().from(accounts).where(and(eq(accounts.id, id), eq(accounts.ownerId, ctx.ownerId))).get();
  if (!row) throw new NotFoundError(`Account ${id}`);
  return row;
}

async function requireCertificate(ctx: ServiceContext, id: string) {
  const row = await ctx.db
    .select()
    .from(hotelCertificates)
    .where(and(eq(hotelCertificates.id, id), eq(hotelCertificates.ownerId, ctx.ownerId)))
    .get();
  if (!row) throw new NotFoundError(`Hotel certificate ${id}`);
  return row;
}

async function validateBenefit(ctx: ServiceContext, accountId: string, benefitId: string | null | undefined) {
  if (!benefitId) return;
  const benefit = await ctx.db
    .select()
    .from(benefits)
    .where(and(eq(benefits.id, benefitId), eq(benefits.ownerId, ctx.ownerId)))
    .get();
  if (!benefit) throw new NotFoundError(`Benefit ${benefitId}`);
  if (benefit.accountId !== accountId) throw new BadRequestError("benefitId must belong to the certificate's account");
  if (benefit.unit !== "free_night" && benefit.unit !== "certificate")
    throw new BadRequestError("benefitId must identify a free-night or certificate benefit");
}

function decorate<T extends typeof hotelCertificates.$inferSelect>(row: T, today: string) {
  const status: HotelCertificateStatus = row.usedAt ? "used" : row.expiresOn < today ? "expired" : "unused";
  const day = 86_400_000;
  const daysUntilExpiration = Math.round((Date.parse(`${row.expiresOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / day);
  return { ...row, status, daysUntilExpiration };
}

export async function createCertificate(ctx: ServiceContext, accountId: string, input: z.infer<typeof hotelCertificateInput>) {
  await requireAccount(ctx, accountId);
  await validateBenefit(ctx, accountId, input.benefitId);
  const [row] = await ctx.db
    .insert(hotelCertificates)
    .values({ ...input, id: newId(), ownerId: ctx.ownerId, accountId })
    .returning();
  return decorate(row!, ctx.today);
}

export async function updateCertificate(ctx: ServiceContext, id: string, patch: z.infer<typeof hotelCertificatePatch>) {
  const current = await requireCertificate(ctx, id);
  if (patch.benefitId !== undefined) await validateBenefit(ctx, current.accountId, patch.benefitId);
  const [row] = await ctx.db
    .update(hotelCertificates)
    .set({ ...patch, updatedAt: nowIso() })
    .where(and(eq(hotelCertificates.id, id), eq(hotelCertificates.ownerId, ctx.ownerId)))
    .returning();
  return decorate(row!, ctx.today);
}

export async function markCertificateUsed(ctx: ServiceContext, id: string, usedAt = ctx.today) {
  return updateCertificate(ctx, id, { usedAt });
}

export async function listCertificates(
  ctx: ServiceContext,
  opts: { accountId?: string; status?: HotelCertificateStatus; expiringWithinDays?: number } = {},
) {
  const rows = await ctx.db
    .select({ certificate: hotelCertificates, account: accounts, productName: products.name, currency: products.currency })
    .from(hotelCertificates)
    .innerJoin(accounts, eq(hotelCertificates.accountId, accounts.id))
    .leftJoin(products, eq(accounts.productId, products.id))
    .where(and(eq(hotelCertificates.ownerId, ctx.ownerId), opts.accountId ? eq(hotelCertificates.accountId, opts.accountId) : undefined))
    .orderBy(asc(hotelCertificates.expiresOn));
  const view = await catalogView(ctx);
  return rows
    .map((r) => {
      const product = r.account.productId ? view.products.get(r.account.productId) : undefined;
      return {
        ...decorate(r.certificate, ctx.today),
        accountLabel: accountLabel(r.account, product?.name ?? r.productName),
        productName: product?.name ?? r.productName,
        productProgram: product?.currency ?? r.currency,
      };
    })
    .filter(
      (c) =>
        (!opts.status || c.status === opts.status) &&
        (opts.expiringWithinDays === undefined || (c.status === "unused" && c.daysUntilExpiration <= opts.expiringWithinDays)),
    )
    .sort((a, b) => (a.status === "unused" ? 0 : 1) - (b.status === "unused" ? 0 : 1) || a.expiresOn.localeCompare(b.expiresOn));
}

export async function deleteCertificate(ctx: ServiceContext, id: string) {
  await requireCertificate(ctx, id);
  await ctx.db.delete(hotelCertificates).where(and(eq(hotelCertificates.id, id), eq(hotelCertificates.ownerId, ctx.ownerId)));
  return { deleted: id };
}
