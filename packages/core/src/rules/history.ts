import type { HistoryAccount, IsoDate } from "../types";

/** Accounts that were actually opened (approved), not just applied for or denied. */
export function wasOpened(a: HistoryAccount): boolean {
  return a.status === "open" || a.status === "closed";
}

export function isOpenNow(a: HistoryAccount, asOf: IsoDate): boolean {
  if (a.status !== "open") return false;
  if (a.closedAt && a.closedAt <= asOf) return false;
  if (a.openedAt && a.openedAt > asOf) return false;
  return true;
}

/** Date used for application-velocity rules (applications include denials). */
export function applicationDate(a: HistoryAccount): IsoDate | null {
  return a.appliedAt ?? a.openedAt ?? null;
}

/** Does this account appear on the personal credit report? */
export function reportsToPersonalCredit(a: HistoryAccount): boolean {
  if (a.kind !== "credit_card") return false;
  if (a.ownerType === "personal") return true;
  return a.reportsToPersonal === true;
}

export interface BonusRecord {
  date: IsoDate;
  productId: string | null;
  family: string | null;
  issuer: string;
  account: HistoryAccount;
}

/** Every bonus in the history, tagged with the product it was earned on. */
export function allBonuses(accounts: HistoryAccount[], asOf: IsoDate): BonusRecord[] {
  const out: BonusRecord[] = [];
  for (const a of accounts) {
    for (const date of a.bonusDates ?? [])
      out.push({ date, productId: a.productId ?? null, family: a.family ?? null, issuer: a.issuer, account: a });
    for (const b of a.bonuses ?? [])
      out.push({
        date: b.date,
        productId: b.productId === undefined ? (a.productId ?? null) : b.productId,
        family: b.family === undefined ? (a.family ?? null) : b.family,
        issuer: a.issuer,
        account: a,
      });
  }
  return out.filter((b) => b.date <= asOf);
}

export function latestBonus(
  accounts: HistoryAccount[],
  asOf: IsoDate,
  match: (b: BonusRecord) => boolean,
): BonusRecord | undefined {
  let best: BonusRecord | undefined;
  for (const b of allBonuses(accounts, asOf)) if (match(b) && (!best || b.date > best.date)) best = b;
  return best;
}

/** Has this account ever been the given product (now or before a product change)? */
export function everProduct(a: HistoryAccount, productId: string): boolean {
  return a.productId === productId || (a.pastProducts ?? []).some((p) => p.productId === productId);
}

/** Every (family, rank) the account has ever had. */
export function everFamilies(a: HistoryAccount): { productId: string | null; family: string | null; rank?: number }[] {
  return [
    { productId: a.productId ?? null, family: a.family ?? null, rank: a.familyRank },
    ...(a.pastProducts ?? []).map((p) => ({ productId: p.productId, family: p.family ?? null, rank: p.familyRank })),
  ];
}

export function accountLabel(a: HistoryAccount): string {
  return a.label ?? a.productId ?? a.id;
}
