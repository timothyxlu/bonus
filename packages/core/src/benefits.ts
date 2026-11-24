import { addMonths, parseIso, toIso } from "./dates";
import type { BenefitPeriod, IsoDate } from "./types";

export interface Period {
  /** Inclusive. */
  start: IsoDate;
  /** Exclusive. */
  end: IsoDate;
}

/**
 * The benefit period containing `asOf`.
 * Calendar periods reset on Jan 1 / quarter / half-year / month boundaries;
 * `cardmember_year` resets on the account anniversary (`anchor`, usually the open date).
 */
export function periodFor(period: BenefitPeriod, asOf: IsoDate, anchor?: IsoDate | null): Period {
  const d = parseIso(asOf);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const mk = (yy: number, mm: number) => toIso(new Date(Date.UTC(yy, mm, 1)));
  switch (period) {
    case "monthly":
      return { start: mk(y, m), end: mk(y, m + 1) };
    case "quarterly": {
      const q = Math.floor(m / 3) * 3;
      return { start: mk(y, q), end: mk(y, q + 3) };
    }
    case "semiannual": {
      const h = m < 6 ? 0 : 6;
      return { start: mk(y, h), end: mk(y, h + 6) };
    }
    case "annual":
      return { start: mk(y, 0), end: mk(y + 1, 0) };
    case "cardmember_year": {
      if (!anchor) return { start: mk(y, 0), end: mk(y + 1, 0) };
      const years = Math.floor(monthsBetween(anchor, asOf) / 12);
      const start = addMonths(anchor, years * 12);
      return { start, end: addMonths(anchor, (years + 1) * 12) };
    }
  }
}

function monthsBetween(a: IsoDate, b: IsoDate): number {
  const [ay, am, ad] = a.split("-").map(Number) as [number, number, number];
  const [by, bm, bd] = b.split("-").map(Number) as [number, number, number];
  let months = (by - ay) * 12 + (bm - am);
  if (bd < ad) months -= 1;
  return Math.max(0, months);
}

export interface BenefitUseLike {
  usedOn: IsoDate;
  amount: number;
}

export interface BenefitStatus {
  currentPeriod: Period;
  used: number;
  remaining: number;
  /** No uses recorded in the current period (or remaining > 0 when amount is known). */
  unused: boolean;
}

export function benefitStatus(
  benefit: { period: BenefitPeriod; amount: number },
  uses: BenefitUseLike[],
  asOf: IsoDate,
  anchor?: IsoDate | null,
): BenefitStatus {
  const currentPeriod = periodFor(benefit.period, asOf, anchor);
  const inPeriod = uses.filter((u) => u.usedOn >= currentPeriod.start && u.usedOn < currentPeriod.end);
  const used = inPeriod.reduce((s, u) => s + (u.amount || 0), 0);
  const remaining = Math.max(0, benefit.amount - used);
  const unused = benefit.amount > 0 ? remaining > 0 : inPeriod.length === 0;
  return { currentPeriod, used, remaining, unused };
}
