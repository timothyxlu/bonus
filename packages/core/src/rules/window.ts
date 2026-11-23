import { addDays, addMonths, startOfMonth } from "../dates";
import type { IsoDate } from "../types";

export interface WindowItem<T = unknown> {
  date: IsoDate;
  /** First date on which the item no longer counts. */
  dropsOn: IsoDate;
  ref: T;
}

/**
 * When does an item dated `date` leave a rolling window of `months` months?
 * `conservative` rounds to the month boundary because credit reports usually
 * only show the month an account was opened.
 */
export function monthDrop(date: IsoDate, months: number, conservative: boolean): IsoDate {
  return conservative ? addMonths(startOfMonth(date), months + 1) : addMonths(date, months);
}

export function dayDrop(date: IsoDate, days: number): IsoDate {
  return addDays(date, days);
}

export interface WindowResult<T> {
  /** Items inside the window, sorted by the date they drop off (earliest first). */
  counted: WindowItem<T>[];
  count: number;
  /** True when count >= limit. */
  atLimit: boolean;
  /** Earliest date the count falls below `limit` (only when atLimit). */
  clearsOn?: IsoDate;
  /** Next date any item drops off. */
  nextDrop?: IsoDate;
}

export function rollingWindow<T>(items: WindowItem<T>[], asOf: IsoDate, limit: number): WindowResult<T> {
  const counted = items
    .filter((i) => i.date <= asOf && i.dropsOn > asOf)
    .sort((a, b) => (a.dropsOn < b.dropsOn ? -1 : a.dropsOn > b.dropsOn ? 1 : 0));
  const count = counted.length;
  const atLimit = count >= limit;
  return {
    counted,
    count,
    atLimit,
    clearsOn: atLimit ? counted[count - limit]!.dropsOn : undefined,
    nextDrop: counted[0]?.dropsOn,
  };
}
