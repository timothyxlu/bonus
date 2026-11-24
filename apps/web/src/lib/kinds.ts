import type { AccountKind } from "@bonus/core";
import { t, type MessageKey } from "../i18n";

/** Per-category presentation. Add a row here when a new account kind is introduced. */
export const KIND_META: Record<AccountKind, { label: MessageKey; plural: MessageKey; last4?: MessageKey; last4Hint?: MessageKey; hasCatalog: boolean; hasAU: boolean; hasBenefits: boolean }> = {
  credit_card: { label: "kind.credit_card", plural: "kindPlural.credit_card", last4: "acct.last4", last4Hint: "acct.last4Hint", hasCatalog: true, hasAU: true, hasBenefits: true },
  bank_account: { label: "kind.bank_account", plural: "kindPlural.bank_account", last4: "acct.last4.bank", last4Hint: "acct.last4Hint.bank", hasCatalog: false, hasAU: false, hasBenefits: false },
  gift_card: { label: "kind.gift_card", plural: "kindPlural.gift_card", last4: "acct.last4", last4Hint: "acct.last4Hint", hasCatalog: false, hasAU: false, hasBenefits: false },
};

export const kindLabel = (k: AccountKind) => t(KIND_META[k].label);
