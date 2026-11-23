import {
  checkEligibility,
  five24Status,
  type EligibilityOptions,
  type HistoryAccount,
  type RuleProduct,
} from "@bonus/core";
import { eq, inArray } from "drizzle-orm";
import { bonuses, events, type Product } from "../db/schema";
import { accounts } from "../db/schema";
import { accountLabel } from "./accounts";
import { listProducts } from "./catalog";
import { BadRequestError, type ServiceContext } from "./context";

export function toRuleProduct(p: Product): RuleProduct {
  return { id: p.id, name: p.name, issuer: p.institutionId, family: p.family, ownerType: p.ownerType, kind: p.kind, rules: p.rules ?? {} };
}

/** Build the normalised history the rules engine consumes. */
export async function buildHistory(ctx: ServiceContext) {
  const productRows = await listProducts(ctx);
  const byId = new Map(productRows.map((p) => [p.id, p]));
  const accountRows = await ctx.db.select().from(accounts).where(eq(accounts.ownerId, ctx.ownerId));
  const ids = accountRows.map((a) => a.id);
  const [bonusRows, eventRows] = ids.length
    ? await Promise.all([
        ctx.db.select().from(bonuses).where(inArray(bonuses.accountId, ids)),
        ctx.db.select().from(events).where(inArray(events.accountId, ids)),
      ])
    : [[], []];

  const history: HistoryAccount[] = accountRows.map((a) => {
    const p = a.productId ? byId.get(a.productId) : undefined;
    const productInfo = (id: string | null | undefined) => {
      const x = id ? byId.get(id) : undefined;
      return { productId: id ?? null, family: x?.family ?? null };
    };
    const acctBonuses = [
      ...bonusRows
        .filter((b) => b.accountId === a.id && b.status === "posted" && b.earnedAt)
        .map((b) => ({ date: b.earnedAt!, ...productInfo(b.productId ?? a.productId) })),
      ...eventRows
        .filter((e) => e.accountId === a.id && e.type === "bonus_earned")
        .map((e) => ({ date: e.date, ...productInfo((e.data?.productId as string | undefined) ?? a.productId) })),
    ];
    // De-duplicate (an event and a posted bonus for the same day/product).
    const seen = new Set<string>();
    const uniqueBonuses = acctBonuses.filter((b) => {
      const k = `${b.date}|${b.productId}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const pastProducts = eventRows
      .filter((e) => e.accountId === a.id && e.fromProductId && ["product_change", "upgrade", "downgrade"].includes(e.type))
      .map((e) => {
        const x = byId.get(e.fromProductId!);
        return { productId: e.fromProductId!, family: x?.family ?? null, familyRank: x?.rules?.familyRank };
      });
    return {
      id: a.id,
      label: accountLabel(a, p?.name),
      productId: a.productId,
      issuer: p?.institutionId ?? a.institutionId ?? "unknown",
      family: p?.family ?? null,
      kind: a.kind,
      ownerType: a.ownerType,
      status: a.status,
      appliedAt: a.appliedAt,
      openedAt: a.openedAt,
      closedAt: a.closedAt,
      bonuses: uniqueBonuses,
      pastProducts,
      reportsToPersonal: p?.rules?.reportsToPersonal,
      isCharge: p?.rules?.isCharge,
      familyRank: p?.rules?.familyRank,
      isAuthorizedUser: a.isAuthorizedUser,
    };
  });
  return { products: productRows.map(toRuleProduct), accounts: history };
}

export async function checkProductEligibility(ctx: ServiceContext, productId: string, opts: EligibilityOptions & { asOf?: string } = {}) {
  const history = await buildHistory(ctx);
  if (!history.products.some((p) => p.id === productId)) throw new BadRequestError(`Unknown product: ${productId}`);
  return checkEligibility(productId, history, opts.asOf ?? ctx.today, opts);
}

export async function getFive24(ctx: ServiceContext, opts: EligibilityOptions & { asOf?: string } = {}) {
  const history = await buildHistory(ctx);
  return five24Status(history.accounts, opts.asOf ?? ctx.today, opts);
}

/** Evaluate every visible product of a kind (default credit cards) in one pass. */
export async function checkAllProducts(ctx: ServiceContext, opts: EligibilityOptions & { asOf?: string; kind?: string } = {}) {
  const history = await buildHistory(ctx);
  const asOf = opts.asOf ?? ctx.today;
  return history.products
    .filter((p) => p.kind === (opts.kind ?? "credit_card"))
    .map((p) => {
      const r = checkEligibility(p.id, history, asOf, opts);
      return { productId: p.id, productName: p.name, issuer: p.issuer, status: r.status, eligibleFrom: r.eligibleFrom, blockedBy: r.reasons.filter((x) => x.outcome === "block").map((x) => x.rule) };
    });
}
