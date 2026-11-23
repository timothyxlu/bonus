import type { IsoDate } from "./types";

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== "string" || !ISO_RE.test(value)) return false;
  const d = parseIso(value);
  return toIso(d) === value;
}

export function parseIso(value: IsoDate): Date {
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}

export function toIso(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

export function today(now: Date = new Date()): IsoDate {
  return toIso(now);
}

export function addDays(value: IsoDate, days: number): IsoDate {
  const d = parseIso(value);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

/** Add calendar months, clamping to the end of the target month (Jan 31 + 1 = Feb 28/29). */
export function addMonths(value: IsoDate, months: number): IsoDate {
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  const targetMonthIndex = m - 1 + months;
  const ty = y + Math.floor(targetMonthIndex / 12);
  const tm = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return toIso(new Date(Date.UTC(ty, tm, Math.min(d, lastDay))));
}

/** First day of the month containing `value`. */
export function startOfMonth(value: IsoDate): IsoDate {
  return `${value.slice(0, 7)}-01`;
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((parseIso(b).getTime() - parseIso(a).getTime()) / 86_400_000);
}

export function maxDate(...dates: (IsoDate | undefined | null)[]): IsoDate | undefined {
  let best: IsoDate | undefined;
  for (const d of dates) if (d && (!best || d > best)) best = d;
  return best;
}

export function minDate(...dates: (IsoDate | undefined | null)[]): IsoDate | undefined {
  let best: IsoDate | undefined;
  for (const d of dates) if (d && (!best || d < best)) best = d;
  return best;
}
