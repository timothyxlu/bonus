import { addMonths, checkOfferEligibility, valueOffer, type OfferLike } from "@bonus/core";
import { and, desc, eq } from "drizzle-orm";
import type { z } from "zod";
import { bonuses, offers, type Offer } from "../db/schema";
import type { claimOfferInput, offerInput, offerPatch } from "../schemas";
import { createAccount } from "./accounts";
import { getProduct, listInstitutions, listProducts } from "./catalog";
import { BadRequestError, NotFoundError, newId, nowIso, type ServiceContext } from "./context";
import { buildHistory } from "./eligibility";

const toLike = (o: Offer): OfferLike => ({ ...o });

async function requireOffer(ctx: ServiceContext, id: string) {
  const row = await ctx.db.select().from(offers).where(and(eq(offers.id, id), eq(offers.ownerId, ctx.ownerId))).get();
  if (!row) throw new NotFoundError(`Offer ${id}`);
  return row;
}

export async function createOffer(ctx: ServiceContext, input: z.infer<typeof offerInput>) {
  let institutionId = input.institutionId ?? null;
  if (input.productId) {
    const p = await getProduct(ctx, input.productId);
    if (p.kind !== input.kind) throw new BadRequestError(`Product ${p.id} is a ${p.kind}, not a ${input.kind}`);
    institutionId = p.institutionId;
  } else {
    const insts = await listInstitutions(ctx);
    if (!insts.some((i) => i.id === institutionId)) throw new BadRequestError(`Unknown institution: ${institutionId}`);
  }
  const [row] = await ctx.db
    .insert(offers)
    .values({ ...input, id: newId(), ownerId: ctx.ownerId, productId: input.productId ?? null, institutionId: institutionId! })
    .returning();
  return row!;
}

export async function updateOffer(ctx: ServiceContext, id: string, patch: z.infer<typeof offerPatch>) {
  await requireOffer(ctx, id);
  const [row] = await ctx.db.update(offers).set({ ...patch, updatedAt: nowIso() }).where(eq(offers.id, id)).returning();
  return row!;
}

export async function deleteOffer(ctx: ServiceContext, id: string) {
  await requireOffer(ctx, id);
  await ctx.db.delete(offers).where(eq(offers.id, id));
  return { deleted: id };
}

/**
 * Offers ranked for the 机会 page: valued (points converted to USD, minus first-year
 * fee and costs) and checked against the owner's history. Eligible and uncertain offers
 * share the top tier by net value; blocked ones follow, soonest-available first.
 */
export async function listOpportunities(ctx: ServiceContext, opts: { kind?: string; includeArchived?: boolean; asOf?: string } = {}) {
  const asOf = opts.asOf ?? ctx.today;
  const [rows, history] = await Promise.all([
    ctx.db.select().from(offers).where(eq(offers.ownerId, ctx.ownerId)).orderBy(desc(offers.updatedAt)),
    buildHistory(ctx),
  ]);
  const [instRows, productRows] = await Promise.all([listInstitutions(ctx), listProducts(ctx)]);
  const insts = new Map(instRows.map((i) => [i.id, i.name]));
  const products = new Map(productRows.map((p) => [p.id, p]));
  const list = rows
    .filter((o) => (opts.includeArchived || o.status === "active") && (!opts.kind || o.kind === opts.kind))
    .map((o) => {
      const p = o.productId ? products.get(o.productId) : undefined;
      const value = valueOffer(toLike(o), { currency: p?.currency, productAnnualFee: p?.annualFee });
      const eligibility = checkOfferEligibility(toLike(o), history, asOf);
      return {
        ...o,
        productName: p?.name ?? null,
        currency: p?.currency ?? null,
        institutionName: insts.get(o.institutionId) ?? o.institutionId,
        expired: !!o.expiresAt && o.expiresAt < asOf,
        value,
        eligibility,
      };
    });
  // Eligible and uncertain share a tier (uncertain = rules not modelled); blocked sinks.
  const rank = (s: string) => (s === "blocked" ? 2 : 0);
  return list.sort((a, b) => {
    const ra = rank(a.eligibility.status);
    const rb = rank(b.eligibility.status);
    if (ra !== rb) return ra - rb;
    if (ra === 2) return (a.eligibility.eligibleFrom ?? "9999").localeCompare(b.eligibility.eligibleFrom ?? "9999") || b.value.netUsd - a.value.netUsd;
    return b.value.netUsd - a.value.netUsd;
  });
}

/** "I applied/opened it": create the account plus a bonus target from the offer. */
export async function claimOffer(ctx: ServiceContext, id: string, input: z.infer<typeof claimOfferInput>) {
  const o = await requireOffer(ctx, id);
  const openedAt = input.openedAt ?? ctx.today;
  const account = await createAccount(ctx, {
    kind: o.kind,
    productId: o.productId,
    institutionId: o.productId ? null : o.institutionId,
    nickname: input.nickname ?? (o.productId ? null : o.title),
    last4: input.last4 ?? null,
    status: "open",
    appliedAt: openedAt,
    openedAt,
    isAuthorizedUser: false,
    details: {},
    notes: o.sourceUrl ? `Offer: ${o.sourceUrl}` : null,
  });
  await ctx.db.insert(bonuses).values({
    id: newId(),
    ownerId: ctx.ownerId,
    accountId: account.id,
    productId: o.productId,
    description: o.title,
    requirementType: o.requirementType,
    amountRequired: o.amountRequired,
    progress: 0,
    deadline: o.windowMonths ? addMonths(openedAt, o.windowMonths) : null,
    rewardAmount: o.rewardAmount,
    rewardUnit: o.rewardUnit,
    status: "in_progress",
  });
  return { accountId: account.id };
}
