import type { HistoryAccount, IsoDate } from "../types";
import { accountLabel, reportsToPersonalCredit, wasOpened } from "./history";
import { monthDrop, rollingWindow, type WindowItem } from "./window";

export interface PersonalCountOptions {
  /** Count authorized-user cards (Chase may remove them on reconsideration). Default true. */
  countAuthorizedUsers?: boolean;
  /** Round drop-off dates to month boundaries. Default true. */
  conservative?: boolean;
}

export interface CountedAccount {
  id: string;
  label: string;
  openedAt: IsoDate;
  dropsOn: IsoDate;
  issuer: string;
  ownerType: HistoryAccount["ownerType"];
  isAuthorizedUser: boolean;
}

export interface X24Status {
  limit: number;
  count: number;
  /** count < limit */
  under: boolean;
  counted: CountedAccount[];
  /** Next date the count goes down by one. */
  nextDropDate?: IsoDate;
  /** Date the count first falls below the limit (only when at/over the limit). */
  eligibleFrom?: IsoDate;
  /** Opened personal cards with no opened date - the count may be understated. */
  unknownDates: { id: string; label: string }[];
  asOf: IsoDate;
}

/**
 * Count new personal-report accounts opened in the last 24 months, from any issuer.
 * Used for Chase 5/24 (limit 5) and Barclays 6/24 (limit 6).
 */
export function x24Status(
  accounts: HistoryAccount[],
  asOf: IsoDate,
  limit: number,
  options: PersonalCountOptions = {},
): X24Status {
  const countAU = options.countAuthorizedUsers ?? true;
  const conservative = options.conservative ?? true;
  const relevant = accounts.filter(
    (a) => wasOpened(a) && reportsToPersonalCredit(a) && (countAU || !a.isAuthorizedUser),
  );
  const items: WindowItem<HistoryAccount>[] = [];
  const unknownDates: { id: string; label: string }[] = [];
  for (const a of relevant) {
    if (!a.openedAt) {
      unknownDates.push({ id: a.id, label: accountLabel(a) });
      continue;
    }
    items.push({ date: a.openedAt, dropsOn: monthDrop(a.openedAt, 24, conservative), ref: a });
  }
  const w = rollingWindow(items, asOf, limit);
  return {
    limit,
    count: w.count,
    under: w.count < limit,
    counted: w.counted.map((i) => ({
      id: i.ref.id,
      label: accountLabel(i.ref),
      openedAt: i.date,
      dropsOn: i.dropsOn,
      issuer: i.ref.issuer,
      ownerType: i.ref.ownerType,
      isAuthorizedUser: !!i.ref.isAuthorizedUser,
    })),
    nextDropDate: w.nextDrop,
    eligibleFrom: w.clearsOn,
    unknownDates,
    asOf,
  };
}

export function five24Status(accounts: HistoryAccount[], asOf: IsoDate, options?: PersonalCountOptions) {
  return x24Status(accounts, asOf, 5, options);
}
