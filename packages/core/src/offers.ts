/**
 * Opportunities: offers the owner could go after next, valued and checked
 * against their history. Works for every account kind.
 */
import { addMonths } from "./dates";
import { allBonuses, isOpenNow } from "./rules/history";
import { checkEligibility, combineReasons, type EligibilityHistory, type EligibilityOptions } from "./rules/engine";
import type { AccountKind, BonusRequirementType, EligibilityStatus, IsoDate, RewardUnit, RuleReason } from "./types";

/**
 * Default cents-per-point estimates by points programme (rough public valuations).
 * Matched case-insensitively against the product's currency; every offer can override.
 */
export const DEFAULT_POINT_VALUES: { match: RegExp; cents: number }[] = [
  { match: /ultimate rewards/i, cents: 1.5 },
  { match: /membership rewards/i, cents: 1.5 },
  { match: /thankyou/i, cents: 1.4 },
  { match: /capital one/i, cents: 1.4 },
  { match: /hyatt/i, cents: 1.7 },
  { match: /aadvantage/i, cents: 1.5 },
  { match: /united|mileageplus/i, cents: 1.3 },
  { match: /southwest/i, cents: 1.3 },
  { match: /jetblue|trueblue/i, cents: 1.3 },
  { match: /delta|skymiles/i, cents: 1.2 },
  { match: /marriott|bonvoy/i, cents: 0.8 },
  { match: /ihg/i, cents: 0.6 },
  { match: /hilton/i, cents: 0.5 },
  { match: /wyndham/i, cents: 1.0 },
];
const UNIT_DEFAULT_CENTS: Record<RewardUnit, number> = { points: 1.0, miles: 1.2, USD: 100 };

/** Cents per unit for a reward, from an explicit value, the programme, or the unit default. */
export function centsPerUnit(unit: RewardUnit, currency?: string | null, override?: number | null): number {
  if (override !== null && override !== undefined && override > 0) return override;
  if (unit === "USD") return 100;
  const hit = currency ? DEFAULT_POINT_VALUES.find((v) => v.match.test(currency)) : undefined;
  return hit?.cents ?? UNIT_DEFAULT_CENTS[unit];
}

export interface OfferLike {
  id: string;
  kind: AccountKind;
  productId?: string | null;
  institutionId: string;
  title: string;
  rewardAmount: number;
  rewardUnit: RewardUnit;
  /** Overrides the cents-per-point estimate. */
  centsPerPoint?: number | null;
  /** Overrides the computed value entirely (USD). */
  estValueUsd?: number | null;
  requirementType: BonusRequirementType;
  amountRequired?: number | null;
  /** Months allowed to meet the requirement. */
  windowMonths?: number | null;
  /** First-year fee (USD). Defaults to the product's annual fee. */
  annualFee?: number | null;
  feeWaivedFirstYear?: boolean;
  /** Other costs (USD), e.g. monthly fees you expect to pay. */
  otherCost?: number | null;
  /** Bank/gift offers: months after a previous bonus at this institution (same kind) before you qualify again. */
  cooldownMonths?: number | null;
  expiresAt?: IsoDate | null;
}

export interface OfferValuation {
  grossUsd: number;
  costUsd: number;
  netUsd: number;
  centsPerPoint: number;
  /** Net value per dollar that must be spent / deposited (null when there is no amount). */
  returnOnRequired: number | null;
}

export function valueOffer(o: OfferLike, ctx: { currency?: string | null; productAnnualFee?: number | null } = {}): OfferValuation {
  const cpp = centsPerUnit(o.rewardUnit, ctx.currency, o.centsPerPoint);
  const grossUsd = o.estValueUsd !== null && o.estValueUsd !== undefined ? o.estValueUsd : (o.rewardAmount * cpp) / 100;
  const fee = o.feeWaivedFirstYear ? 0 : (o.annualFee ?? ctx.productAnnualFee ?? 0);
  const costUsd = fee + (o.otherCost ?? 0);
  const netUsd = grossUsd - costUsd;
  const req = o.amountRequired ?? 0;
  return { grossUsd, costUsd, netUsd, centsPerPoint: cpp, returnOnRequired: req > 0 ? netUsd / req : null };
}

export interface OfferEligibility {
  status: EligibilityStatus;
  reasons: RuleReason[];
  eligibleFrom?: IsoDate;
}

/**
 * Credit cards with a catalog product use the full issuer rules engine. Everything else uses a
 * generic institution rule: a bonus from the same institution and kind within `cooldownMonths`
 * blocks the offer; already holding an open account of that kind there is "uncertain"
 * (many banks exclude existing customers).
 */
export function checkOfferEligibility(o: OfferLike, history: EligibilityHistory, asOf: IsoDate, options: EligibilityOptions = {}): OfferEligibility {
  const reasons: RuleReason[] = [];
  if (o.expiresAt && o.expiresAt < asOf) {
    reasons.push({ rule: "offer_expired", outcome: "block", message: `Offer expired on ${o.expiresAt}.`, params: { date: o.expiresAt } });
  }
  if (o.productId && history.products.some((p) => p.id === o.productId)) {
    const r = checkEligibility(o.productId, history, asOf, options);
    reasons.push(...r.reasons);
  } else {
    const same = history.accounts.filter((a) => a.issuer === o.institutionId && a.kind === o.kind);
    const months = o.cooldownMonths ?? 0;
    if (months > 0) {
      const last = allBonuses(same, asOf).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
      if (last) {
        const until = addMonths(last.date, months);
        if (until > asOf)
          reasons.push({
            rule: "institution_cooldown",
            outcome: "block",
            message: `Bonus from this institution on ${last.date}; eligible again on ${until} (${months}-month rule).`,
            params: { lastBonus: last.date, months, eligibleFrom: until },
            eligibleFrom: until,
          });
        else reasons.push({ rule: "institution_cooldown", outcome: "pass", message: `Last bonus here ${last.date}, outside the ${months}-month window.`, params: { lastBonus: last.date, months } });
      } else reasons.push({ rule: "institution_cooldown", outcome: "pass", message: "No previous bonus from this institution.", params: { months } });
    }
    const holding = same.filter((a) => isOpenNow(a, asOf));
    if (holding.length > 0 && o.kind === "bank_account")
      reasons.push({
        rule: "institution_existing_customer",
        outcome: "uncertain",
        message: `You already have ${holding.length} open account(s) of this kind here; many offers exclude existing customers.`,
        params: { count: holding.length },
      });
    if (reasons.length === 0) reasons.push({ rule: "offer_no_rules", outcome: "pass", message: "No known restrictions recorded for this offer." });
  }
  const { status, eligibleFrom } = combineReasons(reasons);
  return { status, reasons, eligibleFrom };
}
