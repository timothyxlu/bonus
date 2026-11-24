import { addMonths, parseIso, toIso } from "./dates";
import type { BenefitPeriod, BenefitUnit, IsoDate } from "./types";

export interface Period {
  /** Inclusive. */
  start: IsoDate;
  /** Exclusive. */
  end: IsoDate;
  /**
   * 1-based position of the period within its calendar year (month 1-12, quarter 1-4,
   * half 1-2); null for annual / anniversary-based periods. Used for amount overrides.
   */
  index: number | null;
}

/** Shape of a benefit for period / status math. */
export interface BenefitSchedule {
  period: BenefitPeriod;
  /** Amount per period (USD), or count (e.g. 1 free night) for non-USD units. */
  amount: number;
  unit?: BenefitUnit;
  /** every_n_years only: cycle length in months (4 years = 48, 4.5 years = 54). */
  everyMonths?: number | null;
  /**
   * Per-period amount overrides keyed by period index within the calendar year:
   * monthly "1".."12", quarterly "1".."4", semiannual "1".."2". E.g. {"12": 35}.
   */
  amountByPeriod?: Record<string, number> | null;
  startsAt?: IsoDate | null;
  endsAt?: IsoDate | null;
}

/** The anniversary cycle of `months` months (from `anchor`) that contains `asOf`. */
export function cycleFor(anchor: IsoDate, months: number, asOf: IsoDate): Period {
  if (months <= 0) throw new Error("cycle length must be positive");
  if (asOf < anchor) {
    // Before the anchor: the cycle that ends at the anchor.
    return { start: addMonths(anchor, -months), end: anchor, index: null };
  }
  const [ay, am] = anchor.split("-").map(Number) as [number, number];
  const [by, bm] = asOf.split("-").map(Number) as [number, number];
  let k = Math.floor(((by - ay) * 12 + (bm - am)) / months);
  // Anniversaries are computed from the anchor each time (Feb 29 -> Feb 28 in non-leap years).
  while (k > 0 && addMonths(anchor, k * months) > asOf) k--;
  while (addMonths(anchor, (k + 1) * months) <= asOf) k++;
  return { start: addMonths(anchor, k * months), end: addMonths(anchor, (k + 1) * months), index: null };
}

/**
 * The benefit period containing `asOf`.
 * Calendar periods reset on Jan 1 / quarter / Jan 1 + Jul 1 / month boundaries;
 * `cardmember_year` resets on the account anniversary (`anchor`, usually the open date);
 * `every_n_years` repeats every `everyMonths` months from the anchor (Global Entry, PreCheck...).
 */
export function periodFor(period: BenefitPeriod, asOf: IsoDate, anchor?: IsoDate | null, everyMonths?: number | null): Period {
  const d = parseIso(asOf);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const mk = (yy: number, mm: number) => toIso(new Date(Date.UTC(yy, mm, 1)));
  switch (period) {
    case "monthly":
      return { start: mk(y, m), end: mk(y, m + 1), index: m + 1 };
    case "quarterly": {
      const q = Math.floor(m / 3);
      return { start: mk(y, q * 3), end: mk(y, q * 3 + 3), index: q + 1 };
    }
    case "semiannual": {
      const h = m < 6 ? 0 : 1;
      return { start: mk(y, h * 6), end: mk(y, h * 6 + 6), index: h + 1 };
    }
    case "annual":
      return { start: mk(y, 0), end: mk(y + 1, 0), index: null };
    case "cardmember_year":
      return anchor ? cycleFor(anchor, 12, asOf) : { start: mk(y, 0), end: mk(y + 1, 0), index: null };
    case "every_n_years": {
      const months = everyMonths && everyMonths > 0 ? everyMonths : 48;
      // Without an anchor, cycles count from Jan 1 of the current year.
      return cycleFor(anchor ?? mk(y, 0), months, asOf);
    }
  }
}

/** Amount available in a given period, honouring per-period overrides. */
export function amountForPeriod(b: Pick<BenefitSchedule, "amount" | "amountByPeriod">, period: Period): number {
  if (period.index !== null && b.amountByPeriod) {
    const o = b.amountByPeriod[String(period.index)];
    if (typeof o === "number" && Number.isFinite(o)) return o;
  }
  return b.amount;
}

/** Periods per year for value estimates. */
export function periodsPerYear(b: Pick<BenefitSchedule, "period" | "everyMonths">): number {
  switch (b.period) {
    case "monthly":
      return 12;
    case "quarterly":
      return 4;
    case "semiannual":
      return 2;
    case "every_n_years":
      return 12 / (b.everyMonths && b.everyMonths > 0 ? b.everyMonths : 48);
    default:
      return 1;
  }
}

/**
 * Yearly total of a benefit: sums the calendar-year schedule (with overrides) for
 * monthly / quarterly / semiannual, the amount for annual and anniversary periods,
 * and amount / years for every_n_years. In the benefit's own unit (USD or count).
 */
export function annualAmount(b: BenefitSchedule): number {
  const n = { monthly: 12, quarterly: 4, semiannual: 2 }[b.period as "monthly" | "quarterly" | "semiannual"];
  if (n) {
    let total = 0;
    for (let i = 1; i <= n; i++) total += amountForPeriod(b, { start: "", end: "", index: i });
    return total;
  }
  return b.amount * periodsPerYear(b);
}

/** Whether the benefit is in effect on `asOf` (startsAt inclusive, endsAt exclusive). */
export function benefitInEffect(b: Pick<BenefitSchedule, "startsAt" | "endsAt">, asOf: IsoDate) {
  return (!b.startsAt || asOf >= b.startsAt) && (!b.endsAt || asOf < b.endsAt);
}

export interface BenefitUseLike {
  usedOn: IsoDate;
  amount: number;
}

export interface BenefitStatus {
  currentPeriod: Period;
  /** Amount available this period (override-aware); a count for non-USD units. */
  periodAmount: number;
  used: number;
  remaining: number;
  /** Something is left to use this period (and the benefit is in effect). */
  unused: boolean;
  /** False before startsAt / from endsAt on. */
  inEffect: boolean;
}

/**
 * Status of a benefit in the period containing `asOf`.
 * USD: used = sum of use amounts in the period. Other units (free nights, certificates):
 * each recorded use counts as 1 (or its amount if > 0).
 */
export function benefitStatus(b: BenefitSchedule, uses: BenefitUseLike[], asOf: IsoDate, anchor?: IsoDate | null): BenefitStatus {
  const currentPeriod = periodFor(b.period, asOf, b.period === "every_n_years" ? (b.startsAt ?? anchor) : anchor, b.everyMonths);
  const periodAmount = amountForPeriod(b, currentPeriod);
  const inPeriod = uses.filter((u) => u.usedOn >= currentPeriod.start && u.usedOn < currentPeriod.end);
  const isUsd = (b.unit ?? "USD") === "USD";
  const used = isUsd ? inPeriod.reduce((s, u) => s + (u.amount || 0), 0) : inPeriod.reduce((s, u) => s + (u.amount > 0 ? u.amount : 1), 0);
  const quota = isUsd ? periodAmount : Math.max(1, periodAmount);
  const remaining = Math.max(0, quota - used);
  const inEffect = benefitInEffect(b, asOf);
  const unused = inEffect && (isUsd && periodAmount <= 0 ? inPeriod.length === 0 : remaining > 0);
  return { currentPeriod, periodAmount, used, remaining, unused, inEffect };
}
