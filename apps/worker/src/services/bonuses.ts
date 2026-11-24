import { annualAmount, benefitStatus, bonusProgress, type AccountKind, type BonusStatus, type BonusStep } from "@bonus/core";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { z } from "zod";
import { accounts, benefits, benefitUses, bonuses, institutions, products } from "../db/schema";
import type { benefitInput, benefitPatch, benefitUseInput, bonusInput, bonusPatch } from "../schemas";
import { accountLabel } from "./accounts";
import { catalogView } from "./catalog";
import { BadRequestError, NotFoundError, newId, nowIso, type ServiceContext } from "./context";

async function requireAccount(ctx: ServiceContext, id: string) {
  const row = await ctx.db.select().from(accounts).where(and(eq(accounts.id, id), eq(accounts.ownerId, ctx.ownerId))).get();
  if (!row) throw new NotFoundError(`Account ${id}`);
  return row;
}

// ---------------------------------------------------------------- Bonuses

/** Last date any step mentions: the natural overall deadline of a multi-step bonus. */
function lastStepDate(steps: BonusStep[]) {
  const dates = steps.flatMap((s) => [s.dueBy, s.holdUntil]).filter((d): d is string => !!d);
  return dates.length ? dates.sort().at(-1)! : null;
}

export async function createBonus(ctx: ServiceContext, accountId: string, input: z.infer<typeof bonusInput>) {
  const account = await requireAccount(ctx, accountId);
  const deadline = input.deadline ?? (input.steps?.length ? lastStepDate(input.steps) : null);
  const [row] = await ctx.db
    .insert(bonuses)
    .values({ ...input, deadline, id: newId(), ownerId: ctx.ownerId, accountId, productId: input.productId ?? account.productId })
    .returning();
  return { ...row!, ...bonusProgress(row!, ctx.today) };
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
  const steps = patch.steps ?? current.steps ?? [];
  if (patch.status === undefined && current.status === "in_progress") {
    if (steps.length) {
      // Every condition met (deposit made, balance held through its date, ...) -> the one bonus is met.
      if (patch.steps && bonusProgress({ ...current, ...patch, steps }, ctx.today).allStepsMet) set.status = "met";
    } else if (current.amountRequired && (patch.progress ?? 0) >= current.amountRequired) set.status = "met";
  }
  if (patch.steps?.length && patch.deadline === undefined && !current.deadline) set.deadline = lastStepDate(patch.steps);
  const [row] = await ctx.db.update(bonuses).set(set).where(eq(bonuses.id, id)).returning();
  return { ...row!, ...bonusProgress(row!, ctx.today) };
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
          ? (a.dueDate ?? "9999-99-99").localeCompare(b.dueDate ?? "9999-99-99")
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

type BenefitRow = typeof benefits.$inferSelect;
const OVERRIDE_RANGE: Partial<Record<string, number>> = { monthly: 12, quarterly: 4, semiannual: 2 };

/**
 * Normalise and cross-check benefit fields against the (merged) period:
 * everyYears -> everyMonths, override keys within the period's range, every_n_years needs a cycle,
 * endsAt after startsAt.
 */
function normalizeBenefit(merged: Partial<BenefitRow> & { everyYears?: number | null }, patch: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...patch };
  delete out.everyYears;
  if (patch.everyYears !== undefined && patch.everyYears !== null) out.everyMonths = Math.round((patch.everyYears as number) * 12);
  const period = merged.period!;
  const everyMonths = (out.everyMonths as number | null | undefined) ?? merged.everyMonths;
  if (period === "every_n_years" && !everyMonths) throw new BadRequestError("every_n_years needs everyYears (e.g. 4 or 4.5) or everyMonths");
  const overrides = (out.amountByPeriod as Record<string, number> | null | undefined) ?? merged.amountByPeriod;
  if (overrides && Object.keys(overrides).length) {
    const max = OVERRIDE_RANGE[period];
    if (!max) throw new BadRequestError(`amountByPeriod only applies to monthly, quarterly or semiannual benefits (not ${period})`);
    for (const k of Object.keys(overrides)) if (Number(k) < 1 || Number(k) > max) throw new BadRequestError(`amountByPeriod key ${k} is outside 1-${max} for ${period}`);
  }
  const startsAt = (out.startsAt as string | null | undefined) ?? merged.startsAt;
  const endsAt = (out.endsAt as string | null | undefined) ?? merged.endsAt;
  if (startsAt && endsAt && endsAt <= startsAt) throw new BadRequestError("endsAt must be after startsAt");
  return out;
}

export async function createBenefit(ctx: ServiceContext, accountId: string, input: z.infer<typeof benefitInput>) {
  await requireAccount(ctx, accountId);
  const values = normalizeBenefit({ ...input, everyMonths: input.everyMonths ?? null } as Partial<BenefitRow>, input as Record<string, unknown>);
  const [row] = await ctx.db
    .insert(benefits)
    .values({ ...(values as typeof benefits.$inferInsert), id: newId(), ownerId: ctx.ownerId, accountId })
    .returning();
  return withStatus(ctx, row!);
}

async function requireBenefit(ctx: ServiceContext, id: string) {
  const row = await ctx.db.select().from(benefits).where(and(eq(benefits.id, id), eq(benefits.ownerId, ctx.ownerId))).get();
  if (!row) throw new NotFoundError(`Benefit ${id}`);
  return row;
}

export async function updateBenefit(ctx: ServiceContext, id: string, patch: z.infer<typeof benefitPatch>) {
  const current = await requireBenefit(ctx, id);
  const merged = { ...current, ...patch } as Partial<BenefitRow>;
  // Switching away from a period with overrides drops them unless new ones are given.
  const p = patch as Record<string, unknown>;
  if (patch.period && patch.period !== current.period && patch.amountByPeriod === undefined && !OVERRIDE_RANGE[patch.period]) p.amountByPeriod = null;
  const set = normalizeBenefit({ ...merged, amountByPeriod: p.amountByPeriod === null ? null : merged.amountByPeriod }, p);
  const [row] = await ctx.db
    .update(benefits)
    .set({ ...(set as Partial<BenefitRow>), updatedAt: nowIso() })
    .where(and(eq(benefits.id, id), eq(benefits.ownerId, ctx.ownerId)))
    .returning();
  return withStatus(ctx, row!);
}

/** A benefit row plus its current-period status and yearly total. */
async function withStatus(ctx: ServiceContext, b: BenefitRow) {
  const [acct, uses] = await Promise.all([
    ctx.db.select({ openedAt: accounts.openedAt }).from(accounts).where(eq(accounts.id, b.accountId)).get(),
    ctx.db.select().from(benefitUses).where(eq(benefitUses.benefitId, b.id)),
  ]);
  return decorate(b, uses, ctx.today, acct?.openedAt ?? null);
}

function decorate(b: BenefitRow, uses: (typeof benefitUses.$inferSelect)[], today: string, openedAt: string | null) {
  const status = benefitStatus(b, uses, today, openedAt);
  const perYear = annualAmount(b);
  return {
    ...b,
    ...status,
    /** Yearly total in the benefit's unit (USD, or number of nights/certificates). */
    annualAmount: perYear,
    /** Yearly USD value: USD amount, or count x estValueUsd for other units (null if unknown). */
    annualValueUsd: b.unit === "USD" ? perYear : b.estValueUsd ? perYear * b.estValueUsd : null,
    uses: uses.filter((x) => x.usedOn >= status.currentPeriod.start && x.usedOn < status.currentPeriod.end),
  };
}

export async function deleteBenefit(ctx: ServiceContext, id: string) {
  await requireBenefit(ctx, id);
  await ctx.db.batch([ctx.db.delete(benefitUses).where(eq(benefitUses.benefitId, id)), ctx.db.delete(benefits).where(eq(benefits.id, id))]);
  return { deleted: id };
}

export async function markBenefitUsed(ctx: ServiceContext, benefitId: string, input: z.infer<typeof benefitUseInput>) {
  const benefit = await requireBenefit(ctx, benefitId);
  let amount = input.amount;
  if (!amount) {
    // Default: whatever is left in the period containing usedOn (USD), or one unit.
    const s = await withStatusAt(ctx, benefit, input.usedOn);
    amount = benefit.unit === "USD" ? s.remaining || s.periodAmount : 1;
  }
  const [row] = await ctx.db
    .insert(benefitUses)
    .values({ id: newId(), ownerId: ctx.ownerId, benefitId, usedOn: input.usedOn, amount, note: input.note ?? null })
    .returning();
  return row!;
}

async function withStatusAt(ctx: ServiceContext, b: BenefitRow, asOf: string) {
  const [acct, uses] = await Promise.all([
    ctx.db.select({ openedAt: accounts.openedAt }).from(accounts).where(eq(accounts.id, b.accountId)).get(),
    ctx.db.select().from(benefitUses).where(eq(benefitUses.benefitId, b.id)),
  ]);
  return benefitStatus(b, uses, asOf, acct?.openedAt ?? null);
}

export async function deleteBenefitUse(ctx: ServiceContext, useId: string) {
  const row = await ctx.db.select().from(benefitUses).where(and(eq(benefitUses.id, useId), eq(benefitUses.ownerId, ctx.ownerId))).get();
  if (!row) throw new NotFoundError(`Benefit use ${useId}`);
  await ctx.db.delete(benefitUses).where(eq(benefitUses.id, useId));
  return { deleted: useId };
}

/** All benefits with their status in the current period. */
export async function listBenefits(ctx: ServiceContext, opts: { accountId?: string; unusedOnly?: boolean; includeInactive?: boolean } = {}) {
  const rows = await ctx.db
    .select({ benefit: benefits, account: accounts, productName: products.name })
    .from(benefits)
    .innerJoin(accounts, eq(benefits.accountId, accounts.id))
    .leftJoin(products, eq(accounts.productId, products.id))
    .where(
      and(
        eq(benefits.ownerId, ctx.ownerId),
        opts.includeInactive ? undefined : eq(benefits.active, true),
        opts.includeInactive ? undefined : eq(accounts.status, "open"),
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
    .map((r) => ({
      ...decorate(r.benefit, uses.filter((x) => x.benefitId === r.benefit.id), ctx.today, r.account.openedAt),
      accountLabel: accountLabel(r.account, (r.account.productId && view.products.get(r.account.productId)?.name) || r.productName),
    }))
    .filter((b) => (!opts.unusedOnly || b.unused) && (opts.includeInactive || b.inEffect))
    .sort((a, b) => a.currentPeriod.end.localeCompare(b.currentPeriod.end));
}
