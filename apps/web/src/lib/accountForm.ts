import type { AccountKind } from "@bonus/core";
import type { Institution } from "./types";

/** Gift cards belong to merchants; other account flows retain the full institution list. */
export function institutionsForAccountKind(institutions: Institution[], kind: AccountKind) {
  return kind === "gift_card" ? institutions.filter((institution) => institution.type === "merchant") : institutions;
}

export function accountCreationMessageKey(kind: AccountKind | "") {
  return kind === "gift_card" ? "acct.newGiftCard" : "acct.new";
}

export function institutionMessageKey(kind: AccountKind) {
  return kind === "gift_card" ? "acct.merchant" : "acct.institution";
}

export function giftSecretPayload(number: string, pin: string) {
  const values = { number: number.trim(), pin: pin.trim() };
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== ""));
}
