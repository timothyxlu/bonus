import { CATALOG_PRODUCTS, type HistoryAccount, type RuleProduct } from "../src";

export const products: RuleProduct[] = CATALOG_PRODUCTS.map((p) => ({
  id: p.id,
  name: p.name,
  issuer: p.institutionId,
  family: p.family,
  ownerType: p.ownerType,
  kind: p.kind,
  rules: p.rules,
}));

let n = 0;
/** Build a history account from a catalog product id. */
export function acct(productId: string, openedAt: string | null, extra: Partial<HistoryAccount> = {}): HistoryAccount {
  const p = products.find((x) => x.id === productId);
  if (!p) throw new Error(productId);
  return {
    id: `a${++n}`,
    label: p.name,
    productId,
    issuer: p.issuer,
    family: p.family,
    kind: p.kind,
    ownerType: p.ownerType,
    status: "open",
    openedAt,
    appliedAt: openedAt,
    isCharge: p.rules?.isCharge,
    familyRank: p.rules?.familyRank,
    reportsToPersonal: p.rules?.reportsToPersonal,
    ...extra,
  };
}

/** Generic personal card from some other issuer. */
export function other(openedAt: string, extra: Partial<HistoryAccount> = {}): HistoryAccount {
  return acct("discover-it-cash-back", openedAt, extra);
}
