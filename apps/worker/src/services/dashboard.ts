import { ACCOUNT_KINDS, type AccountKind, type RewardUnit } from "@bonus/core";
import { listAccounts } from "./accounts";
import { listBenefits, listBonuses } from "./bonuses";
import type { ServiceContext } from "./context";
import { getFive24 } from "./eligibility";

type UnitTotals = Partial<Record<RewardUnit, number>>;
const add = (t: UnitTotals, unit: RewardUnit, n: number | null) => {
  if (n) t[unit] = (t[unit] ?? 0) + n;
};
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

/** Gift card discount from details.faceValue / details.purchasePrice. */
export function giftCardValue(details: Record<string, unknown>) {
  const face = num(details.faceValue);
  const price = num(details.purchasePrice);
  if (face === null) return null;
  const saved = price === null ? null : face - price;
  return { face, price, saved, discount: saved !== null && face > 0 ? saved / face : null };
}

export async function getDashboard(ctx: ServiceContext) {
  const [five24, allBonuses, unusedBenefits, accts] = await Promise.all([
    getFive24(ctx),
    listBonuses(ctx),
    listBenefits(ctx, { unusedOnly: true }),
    listAccounts(ctx),
  ]);
  const year = ctx.today.slice(0, 4);
  const active = allBonuses.filter((b) => b.active || b.status === "met");
  const earnedThisYear: UnitTotals = {};
  const pending: UnitTotals = {};
  for (const b of allBonuses) {
    if (b.status === "posted" && b.earnedAt?.startsWith(year)) add(earnedThisYear, b.rewardUnit, b.rewardAmount);
    if (b.status === "in_progress" || b.status === "met") add(pending, b.rewardUnit, b.rewardAmount);
  }

  const byKind = Object.fromEntries(
    ACCOUNT_KINDS.map((kind) => {
      const ks = accts.filter((a) => a.kind === kind);
      const open = ks.filter((a) => a.status === "open");
      const kb = allBonuses.filter((b) => b.kind === kind);
      const base = {
        total: ks.length,
        open: open.length,
        activeBonuses: kb.filter((b) => b.status === "in_progress" || b.status === "met").length,
        postedThisYear: kb.filter((b) => b.status === "posted" && b.earnedAt?.startsWith(year)).length,
      };
      if (kind === "credit_card") return [kind, { ...base, annualFees: open.reduce((s, a) => s + (a.annualFee ?? 0), 0) }];
      if (kind === "gift_card") {
        const values = open.map((a) => giftCardValue(a.details)).filter((v) => v !== null);
        const face = values.reduce((s, v) => s + v.face, 0);
        const saved = values.reduce((s, v) => s + (v.saved ?? 0), 0);
        return [kind, { ...base, faceValue: face, saved, avgDiscount: face > 0 ? saved / face : null }];
      }
      return [kind, base];
    }),
  ) as Record<AccountKind, { total: number; open: number; activeBonuses: number; postedThisYear: number; [k: string]: number | null }>;

  return {
    today: ctx.today,
    five24,
    deadlines: active.slice(0, 8),
    unusedBenefits,
    rewards: { earnedThisYear, pending, activeCount: active.length, year },
    byKind,
    stats: {
      openAccounts: accts.filter((a) => a.status === "open").length,
      totalAccounts: accts.length,
      annualFees: byKind.credit_card.annualFees ?? 0,
      activeBonuses: active.length,
    },
  };
}
