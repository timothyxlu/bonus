import { benefitStatus, bonusProgress, type AccountKind, type BonusStatus } from "@bonus/core";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { z } from "zod";
import { accounts, benefits, benefitUses, bonuses, institutions, products } from "../db/schema";
import type { benefitInput, benefitPatch, benefitUseInput, bonusInput, bonusPatch } from "../schemas";
import { accountLabel } from "./accounts";
import { catalogView } from "./catalog";
import { NotFoundError, newId, nowIso, type ServiceContext } from "./context";

async function requireAccount(ctx: ServiceContext, id: string) {
  const row = await ctx.db.select().from(accounts).where(and(eq(accounts.id, id), eq(accounts.ownerId, ctx.ownerId))).get();
  if (!row) throw new NotFoundError(`Account ${id}`);
  return row;
}

// ---------------------------------------------------------------- Bonuses

export async function createBonus(ctx: ServiceContext, accountId: string, input: z.infer<typeof bonusInput>) {
  const account = await requireAccount(ctx, accountId);
  const [row] = await ctx.db
    .insert(bonuses)
    .values({ ...input, id: newId(), ownerId: ctx.ownerId, accountId, productId: input.productId ?? account.productId })
    .returning();
  return row!;
}

async function requireBonus(ctx: ServiceContext, id: string) {
  const row = await ctx.db.select().from(bonuses).where(and(eq(bonuses.id, id), eq(bonuses.ownerId, ctx.ownerId))).get();
  if (!row) throw new NotFoundError(`Bonus ${id}`);
  return row;
}

export async function updateBonus(ctx: ServiceContext, id: string, patch: z.infer<typeof bonusPatch>) {
  const current = await requireBonus(ctx, id);
  const set: typeof patch & { updatedAt: string } = { ...patch, updatedAt: nowIso() };
  if (patch.status === "posted" && !current.earnedAt && !patch.earnedAt) set.earnedAt = ctx.today;
  if (patch.status === undefined && current.status === "in_progress" && current.amountRequired && (patch.progress ?? 0) >= current.amountRequired)
    set.status = "met";
  const [row] = await ctx.db.update(bonuses).set(set).where(eq(bonuses.id, id)).returning();
  return row!;
}

export async function deleteBonus(ctx: ServiceContext, id: string) {
  await requireBonus(ctx, id);
  await ctx.db.delete(bonuses).where(eq(bonuses.id, id));
  return { deleted: id };
}

export interface BonusFilter {
  statuses?: BonusStatus[];
  kind?: AccountKind;
  limit?: number;
}

/** Bonuses across every account kind, with progress and the account they belong to. */
export async function listBonuses(ctx: ServiceContext, filter: BonusFilter = {}) {
  const rows = await ctx.db
    .select({ bonus: bonuses, account: accounts, productName: products.name, institutionId: institutions.id, institutionName: institutions.name })
    .from(bonuses)
    .innerJoin(accounts, eq(bonuses.accountId, accounts.id))
    .leftJoin(products, eq(accounts.productId, products.id))
    .leftJoin(institutions, eq(institutions.id, sql`coalesce(${products.institutionId}, ${accounts.institutionId})`))
    .where(
      and(
        eq(bonuses.ownerId, ctx.ownerId),
        filter.statuses?.length ? inArray(bonuses.status, filter.statuses) : undefined,
        filter.kind ? eq(accounts.kind, filter.kind) : undefined,
      ),
    );
  const view = await catalogView(ctx);
  return rows
    .map((r) => {
      const productName = (r.account.productId && view.products.get(r.account.productId)?.name) || r.productName;
      const institutionName = (r.institutionId && view.institutions.get(r.institutionId)?.name) || r.institutionName;
      return {
        ...r.bonus,
        ...bonusProgress(r.bonus, ctx.today),
        accountLabel: accountLabel(r.account, productName),
        productName,
        kind: r.account.kind,
        institutionId: r.institutionId,
        institutionName,
      };
    })
    .sort((a, b) =>
      a.active !== b.active
        ? a.active ? -1 : 1
        : a.active
          ? (a.deadline ?? "9999-99-99").localeCompare(b.deadline ?? "9999-99-99")
          : (b.earnedAt ?? b.updatedAt).localeCompare(a.earnedAt ?? a.updatedAt),
    )
    .slice(0, filter.limit ?? 500);
}

/** Active bonuses (any account kind) ordered by nearest deadline. */
export async function upcomingDeadlines(ctx: ServiceContext, opts: { withinDays?: number; limit?: number; kind?: AccountKind } = {}) {
  const rows = await listBonuses(ctx, { statuses: ["in_progress", "met"], kind: opts.kind });
  return rows
    .filter((b) => opts.withinDays === undefined || (b.daysLeft !== null && b.daysLeft <= opts.withinDays))
    .slice(0, opts.limit ?? 100);
}

// ---------------------------------------------------------------- Benefits

export async function createBenefit(ctx: ServiceContext, accountId: string, input: z.infer<typeof benefitInput>) {
  await requireAccount(ctx, accountId);
  const [row] = await ctx.db.insert(benefits).values({ ...input, id: newId(), ownerId: ctx.ownerId, accountId }).returning();
  return row!;
}

async function requireBenefit(ctx: ServiceContext, id: string) {
  const row = await ctx.db.select().from(benefits).where(and(eq(benefits.id, id), eq(benefits.ownerId, ctx.ownerId))).get();
  if (!row) throw new NotFoundError(`Benefit ${id}`);
  return row;
}

export async function updateBenefit(ctx: ServiceContext, id: string, patch: z.infer<typeof benefitPatch>) {
  await requireBenefit(ctx, id);
  const [row] = await ctx.db.update(benefits).set({ ...patch, updatedAt: nowIso() }).where(eq(benefits.id, id)).returning();
  return row!;
}

export async function deleteBenefit(ctx: ServiceContext, id: string) {
  await requireBenefit(ctx, id);
  await ctx.db.batch([ctx.db.delete(benefitUses).where(eq(benefitUses.benefitId, id)), ctx.db.delete(benefits).where(eq(benefits.id, id))]);
  return { deleted: id };
}

export async function markBenefitUsed(ctx: ServiceContext, benefitId: string, input: z.infer<typeof benefitUseInput>) {
  const benefit = await requireBenefit(ctx, benefitId);
  const [row] = await ctx.db
    .insert(benefitUses)
    .values({ id: newId(), ownerId: ctx.ownerId, benefitId, usedOn: input.usedOn, amount: input.amount || benefit.amount, note: input.note ?? null })
    .returning();
  return row!;
}

export async function deleteBenefitUse(ctx: ServiceContext, useId: string) {
  const row = await ctx.db.select().from(benefitUses).where(and(eq(benefitUses.id, useId), eq(benefitUses.ownerId, ctx.ownerId))).get();
  if (!row) throw new NotFoundError(`Benefit use ${useId}`);
  await ctx.db.delete(benefitUses).where(eq(benefitUses.id, useId));
  return { deleted: useId };
}

/** All benefits with their status in the current period. */
export async function listBenefits(ctx: ServiceContext, opts: { accountId?: string; unusedOnly?: boolean } = {}) {
  const rows = await ctx.db
    .select({ benefit: benefits, account: accounts, productName: products.name })
    .from(benefits)
    .innerJoin(accounts, eq(benefits.accountId, accounts.id))
    .leftJoin(products, eq(accounts.productId, products.id))
    .where(
      and(
        eq(benefits.ownerId, ctx.ownerId),
        eq(benefits.active, true),
        eq(accounts.status, "open"),
        opts.accountId ? eq(benefits.accountId, opts.accountId) : undefined,
      ),
    )
    .orderBy(asc(benefits.name));
  const view = await catalogView(ctx);
  const uses = rows.length
    ? await ctx.db
        .select()
        .from(benefitUses)
        .where(and(eq(benefitUses.ownerId, ctx.ownerId), inArray(benefitUses.benefitId, rows.map((r) => r.benefit.id))))
        .orderBy(desc(benefitUses.usedOn))
    : [];
  return rows
    .map((r) => {
      const u = uses.filter((x) => x.benefitId === r.benefit.id);
      const status = benefitStatus(r.benefit, u, ctx.today, r.account.openedAt);
      return {
        ...r.benefit,
        ...status,
        accountLabel: accountLabel(r.account, (r.account.productId && view.products.get(r.account.productId)?.name) || r.productName),
        uses: u.filter((x) => x.usedOn >= status.currentPeriod.start && x.usedOn < status.currentPeriod.end),
      };
    })
    .filter((b) => !opts.unusedOnly || b.unused)
    .sort((a, b) => a.currentPeriod.end.localeCompare(b.currentPeriod.end));
}
