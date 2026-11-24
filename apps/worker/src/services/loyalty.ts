import { and, asc, eq } from "drizzle-orm";
import type { z } from "zod";
import { loyaltyBalances } from "../db/schema";
import type { loyaltyBalanceInput, loyaltyBalancePatch } from "../schemas";
import { NotFoundError, newId, nowIso, type ServiceContext } from "./context";

async function requireBalance(ctx: ServiceContext, id: string) {
  const row = await ctx.db
    .select()
    .from(loyaltyBalances)
    .where(and(eq(loyaltyBalances.id, id), eq(loyaltyBalances.ownerId, ctx.ownerId)))
    .get();
  if (!row) throw new NotFoundError(`Loyalty balance ${id}`);
  return row;
}

export async function listBalances(ctx: ServiceContext, category?: string) {
  const rows = await ctx.db
    .select()
    .from(loyaltyBalances)
    .where(and(eq(loyaltyBalances.ownerId, ctx.ownerId), category ? eq(loyaltyBalances.category, category as "flight" | "hotel" | "credit_card") : undefined))
    .orderBy(asc(loyaltyBalances.category), asc(loyaltyBalances.program), asc(loyaltyBalances.createdAt));
  return rows;
}

export async function createBalance(ctx: ServiceContext, input: z.infer<typeof loyaltyBalanceInput>) {
  const row: typeof loyaltyBalances.$inferInsert = { id: newId(), ownerId: ctx.ownerId, ...input, notes: input.notes ?? null };
  await ctx.db.insert(loyaltyBalances).values(row);
  return requireBalance(ctx, row.id);
}

export async function updateBalance(ctx: ServiceContext, id: string, patch: z.infer<typeof loyaltyBalancePatch>) {
  await requireBalance(ctx, id);
  await ctx.db.update(loyaltyBalances).set({ ...patch, updatedAt: nowIso() }).where(and(eq(loyaltyBalances.id, id), eq(loyaltyBalances.ownerId, ctx.ownerId)));
  return requireBalance(ctx, id);
}

export async function deleteBalance(ctx: ServiceContext, id: string) {
  await requireBalance(ctx, id);
  await ctx.db.delete(loyaltyBalances).where(and(eq(loyaltyBalances.id, id), eq(loyaltyBalances.ownerId, ctx.ownerId)));
  return { deleted: id };
}
