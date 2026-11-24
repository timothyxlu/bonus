/**
 * Domain types shared by the API, the MCP server and the web UI.
 * Enums are declared as const arrays so they can be validated at runtime
 * and extended later (bank accounts, gift cards, ...).
 */

export const ACCOUNT_KINDS = ["credit_card", "bank_account", "gift_card"] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

export const OWNER_TYPES = ["personal", "business"] as const;
export type OwnerType = (typeof OWNER_TYPES)[number];

export const ACCOUNT_STATUSES = ["pending", "open", "closed", "denied"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const EVENT_TYPES = [
  "applied",
  "approved",
  "denied",
  "product_change",
  "downgrade",
  "upgrade",
  "closed",
  "bonus_earned",
  "note",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const INSTITUTION_TYPES = ["issuer", "bank", "merchant"] as const;
export type InstitutionType = (typeof INSTITUTION_TYPES)[number];

export const NETWORKS = ["visa", "mastercard", "amex", "discover", "other"] as const;
export type Network = (typeof NETWORKS)[number];

export const BONUS_REQUIREMENT_TYPES = ["spend", "direct_deposit", "balance", "other"] as const;
export type BonusRequirementType = (typeof BONUS_REQUIREMENT_TYPES)[number];

export const REWARD_UNITS = ["points", "miles", "USD"] as const;
export type RewardUnit = (typeof REWARD_UNITS)[number];

export const BONUS_STATUSES = ["in_progress", "met", "posted", "failed", "cancelled"] as const;
export type BonusStatus = (typeof BONUS_STATUSES)[number];

export const BENEFIT_PERIODS = [
  "monthly",
  "quarterly",
  "semiannual",
  "annual",
  "cardmember_year",
  "every_n_years",
] as const;
export type BenefitPeriod = (typeof BENEFIT_PERIODS)[number];

export const BENEFIT_UNITS = ["USD", "free_night", "certificate", "other"] as const;
export type BenefitUnit = (typeof BENEFIT_UNITS)[number];

/** ISO calendar date, `YYYY-MM-DD`. */
export type IsoDate = string;

/**
 * Per-product eligibility configuration. Stored as JSON on the product row so
 * new rule knobs do not need schema changes.
 */
export interface ProductRules {
  /** Bonus is not available if the applicant currently holds this product. Default true. */
  currentHolderIneligible?: boolean;
  /** Months that must pass after receiving a bonus before another bonus is allowed. */
  bonusCooldownMonths?: number;
  /** Whether the cooldown looks at this product only, or every product in the same family. */
  cooldownScope?: "product" | "family";
  /** Amex-style once-per-lifetime welcome offer. */
  lifetimeBonus?: boolean;
  /**
   * Position within the family ladder (Amex family rules). Having held a card with
   * a rank >= this product's rank blocks the bonus on this product.
   */
  familyRank?: number;
  /** Charge card (no preset spending limit) - excluded from Amex's credit card limit. */
  isCharge?: boolean;
  /**
   * Business card that is reported on the personal credit report, and therefore
   * counts toward Chase 5/24 and Barclays 6/24. Defaults to false for business cards.
   */
  reportsToPersonal?: boolean;
}

/** Product as seen by the rules engine. */
export interface RuleProduct {
  id: string;
  name: string;
  /** Institution slug, e.g. `chase`, `amex`, `citi`, `boa`, `barclays`. */
  issuer: string;
  family?: string | null;
  ownerType: OwnerType;
  kind: AccountKind;
  rules?: ProductRules;
}

/** One account in the applicant's history, normalised for the rules engine. */
export interface HistoryAccount {
  id: string;
  label?: string;
  productId?: string | null;
  issuer: string;
  family?: string | null;
  kind: AccountKind;
  ownerType: OwnerType;
  status: AccountStatus;
  /** Application date (falls back to openedAt for velocity rules). */
  appliedAt?: IsoDate | null;
  openedAt?: IsoDate | null;
  closedAt?: IsoDate | null;
  /** Dates on which a sign-up bonus was received for this account (on its current product). */
  bonusDates?: IsoDate[];
  /**
   * Bonuses with the product they were earned on. Use this when the account was
   * product-changed after earning a bonus; overrides nothing, adds to bonusDates.
   */
  bonuses?: { date: IsoDate; productId?: string | null; family?: string | null }[];
  /**
   * True when the account's offer explicitly did not pay out (bonus failed/cancelled):
   * no approximate bonus date is assumed for it.
   */
  noBonus?: boolean;
  /** Products this account used to be (before product changes). */
  pastProducts?: { productId: string; family?: string | null; familyRank?: number }[];
  /** Copied from the product rules when known. */
  reportsToPersonal?: boolean;
  isCharge?: boolean;
  familyRank?: number;
  /** Authorized-user cards appear on the personal report; counted by default. */
  isAuthorizedUser?: boolean;
}

export type RuleOutcome = "pass" | "block" | "uncertain" | "info";

export interface RuleReason {
  /** Stable rule id (e.g. `chase_5_24`); UIs localise by this code. */
  rule: string;
  outcome: RuleOutcome;
  /** English explanation, suitable for MCP / logs. */
  message: string;
  /** Machine-readable parameters for localisation. */
  params?: Record<string, string | number>;
  /** Date this rule stops blocking, when it can be computed. */
  eligibleFrom?: IsoDate;
}

export type EligibilityStatus = "eligible" | "blocked" | "uncertain";

export interface EligibilityResult {
  productId: string;
  productName: string;
  status: EligibilityStatus;
  reasons: RuleReason[];
  /** Earliest date every blocking rule is cleared (only if all blocks have a date). */
  eligibleFrom?: IsoDate;
  asOf: IsoDate;
}
