import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type {
  AccountKind,
  AccountStatus,
  BenefitPeriod,
  BonusStep,
  BenefitUnit,
  BonusRequirementType,
  BonusStatus,
  EventType,
  InstitutionType,
  Network,
  OwnerType,
  ProductRules,
  RewardUnit,
} from "@bonus/core";

const createdAt = () => text("created_at").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`);
const updatedAt = () => text("updated_at").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`);

/**
 * Issuers, banks and merchants. `owner_id` NULL = shared catalog row (seeded);
 * otherwise a user-created row visible only to that owner.
 */
export const institutions = sqliteTable(
  "institutions",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id"),
    name: text("name").notNull(),
    type: text("type").$type<InstitutionType>().notNull().default("issuer"),
    createdAt: createdAt(),
  },
  (t) => [index("institutions_owner_idx").on(t.ownerId)],
);

/** Catalog item, e.g. "Chase Sapphire Reserve". */
export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id"),
    institutionId: text("institution_id")
      .notNull()
      .references(() => institutions.id),
    name: text("name").notNull(),
    kind: text("kind").$type<AccountKind>().notNull().default("credit_card"),
    ownerType: text("owner_type").$type<OwnerType>().notNull().default("personal"),
    /** Product family for issuer rules (chase_sapphire, amex_mr_charge, citi_thankyou, ...). */
    family: text("family"),
    annualFee: real("annual_fee").notNull().default(0),
    network: text("network").$type<Network>(),
    /** Points program / currency, e.g. "Chase Ultimate Rewards". */
    currency: text("currency"),
    rules: text("rules", { mode: "json" }).$type<ProductRules>().notNull().default({}),
    /** Owner-created products only; seeded products are archived per owner via catalog_overrides. */
    archivedAt: text("archived_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("products_owner_idx").on(t.ownerId), index("products_institution_idx").on(t.institutionId)],
);

/**
 * One opened (or applied-for) thing: a credit card, a bank account, a gift card.
 * Only the last 4 digits are ever stored - never full account numbers.
 */
export const accounts = sqliteTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    kind: text("kind").$type<AccountKind>().notNull(),
    ownerType: text("owner_type").$type<OwnerType>().notNull().default("personal"),
    productId: text("product_id").references(() => products.id),
    /** For accounts whose product is not in the catalog. */
    institutionId: text("institution_id").references(() => institutions.id),
    nickname: text("nickname"),
    /**
     * Trailing 4 or 5 digits (Amex shows 5). Never a full number. Column added in
     * migration 0003 with CHECK (NULL or 4-5 digits); exposed as `last4` for compatibility.
     */
    last4: text("last_digits"),
    /** Legacy 4-digit column (CHECKed to exactly 4 digits); values were copied to last_digits. */
    legacyLast4: text("last4"),
    status: text("status").$type<AccountStatus>().notNull().default("open"),
    appliedAt: text("applied_at"),
    openedAt: text("opened_at"),
    closedAt: text("closed_at"),
    isAuthorizedUser: integer("is_authorized_user", { mode: "boolean" }).notNull().default(false),
    /** Kind-specific fields (credit limit, APY, gift card balance, ...). */
    details: text("details", { mode: "json" }).$type<Record<string, unknown>>().notNull().default({}),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("accounts_owner_idx").on(t.ownerId),
    index("accounts_product_idx").on(t.productId),
    // Defense in depth: never store more than the last 4 digits.
    check("accounts_last4_check", sql`${t.legacyLast4} IS NULL OR ${t.legacyLast4} GLOB '[0-9][0-9][0-9][0-9]'`),
  ],
);

/** Timeline per account. */
export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    type: text("type").$type<EventType>().notNull(),
    date: text("date").notNull(),
    /** For product_change / upgrade / downgrade. */
    fromProductId: text("from_product_id"),
    toProductId: text("to_product_id"),
    note: text("note"),
    data: text("data", { mode: "json" }).$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("events_owner_idx").on(t.ownerId), index("events_account_idx").on(t.accountId, t.date)],
);

/** Sign-up / account-opening offer. Shared by cards and (later) bank bonuses. */
export const bonuses = sqliteTable(
  "bonuses",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    /** Product the offer was for (kept when the account is later product-changed). */
    productId: text("product_id"),
    description: text("description"),
    requirementType: text("requirement_type").$type<BonusRequirementType>().notNull().default("spend"),
    amountRequired: real("amount_required"),
    progress: real("progress").notNull().default(0),
    deadline: text("deadline"),
    rewardAmount: real("reward_amount"),
    rewardUnit: text("reward_unit").$type<RewardUnit>().notNull().default("points"),
    status: text("status").$type<BonusStatus>().notNull().default("in_progress"),
    /** Date the bonus posted - feeds the 24/48-month rules. */
    earnedAt: text("earned_at"),
    /** Multi-step conditions that together make up this one bonus (e.g. deposit, then hold a balance). */
    steps: text("steps", { mode: "json" }).$type<BonusStep[]>().notNull().default([]),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("bonuses_owner_idx").on(t.ownerId), index("bonuses_account_idx").on(t.accountId)],
);

/** Recurring credits per account (e.g. $10 monthly dining credit). */
export const benefits = sqliteTable(
  "benefits",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    amount: real("amount").notNull().default(0),
    period: text("period").$type<BenefitPeriod>().notNull(),
    /** Free-text description of how it resets (e.g. "calendar month", "anniversary"). */
    resetRule: text("reset_rule"),
    notes: text("notes"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    /** USD, or a non-dollar benefit (free night, certificate, other) counted per period. */
    unit: text("unit").$type<BenefitUnit>().notNull().default("USD"),
    /** For non-USD units: what it is, e.g. "Free night up to 35k points". */
    valueDescription: text("value_description"),
    /** Optional USD estimate for one unit (non-USD benefits), for totals. */
    estValueUsd: real("est_value_usd"),
    /** every_n_years: cycle length in months (48 = 4 years, 54 = 4.5 years). */
    everyMonths: integer("every_months"),
    /** Per-period amount overrides keyed by period index (month 1-12 / quarter 1-4 / half 1-2). */
    amountByPeriod: text("amount_by_period", { mode: "json" }).$type<Record<string, number>>(),
    enrollmentRequired: integer("enrollment_required", { mode: "boolean" }).notNull().default(false),
    /** Merchant / limitations text, e.g. "Uber rides or Uber Eats in the US". */
    limitations: text("limitations"),
    sourceUrl: text("source_url"),
    /** Benefit in effect from (inclusive) / until (exclusive). */
    startsAt: text("starts_at"),
    endsAt: text("ends_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("benefits_owner_idx").on(t.ownerId), index("benefits_account_idx").on(t.accountId)],
);

export const benefitUses = sqliteTable(
  "benefit_uses",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    benefitId: text("benefit_id")
      .notNull()
      .references(() => benefits.id, { onDelete: "cascade" }),
    usedOn: text("used_on").notNull(),
    amount: real("amount").notNull().default(0),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("benefit_uses_benefit_idx").on(t.benefitId, t.usedOn)],
);

/** One actually issued hotel free-night certificate, tracked independently from its recurring entitlement. */
export const hotelCertificates = sqliteTable(
  "hotel_certificates",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    /** Optional recurring free-night benefit that produced this certificate. */
    benefitId: text("benefit_id").references(() => benefits.id, { onDelete: "set null" }),
    name: text("name").notNull().default("Free night certificate"),
    hotelProgram: text("hotel_program").notNull(),
    expiresOn: text("expires_on").notNull(),
    usedAt: text("used_at"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("hotel_certificates_owner_expiry_idx").on(t.ownerId, t.expiresOn),
    index("hotel_certificates_account_idx").on(t.accountId),
    index("hotel_certificates_benefit_idx").on(t.benefitId),
  ],
);

export type Institution = typeof institutions.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type AccountEvent = typeof events.$inferSelect;
export type Bonus = typeof bonuses.$inferSelect;
export type Benefit = typeof benefits.$inferSelect;
export type BenefitUse = typeof benefitUses.$inferSelect;
export type HotelCertificate = typeof hotelCertificates.$inferSelect;

/** A points or miles balance. Program names are deliberately not unique: one owner may have multiple accounts in a program. */
export const loyaltyBalances = sqliteTable(
  "loyalty_balances",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    category: text("category").$type<"flight" | "hotel" | "credit_card">().notNull(),
    program: text("program").notNull(),
    balance: integer("balance").notNull(),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("loyalty_balances_owner_category_idx").on(t.ownerId, t.category),
    check("loyalty_balances_balance_check", sql`${t.balance} >= 0`),
  ],
);

export type LoyaltyBalance = typeof loyaltyBalances.$inferSelect;

/**
 * Offers the owner might go after next (credit card sign-up offers, bank account
 * bonuses, gift card promos). Maintained in the app or by Claude via MCP; drives the
 * 机会 (opportunities) page.
 */
export const offers = sqliteTable(
  "offers",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    kind: text("kind").$type<AccountKind>().notNull(),
    productId: text("product_id").references(() => products.id),
    institutionId: text("institution_id")
      .notNull()
      .references(() => institutions.id),
    title: text("title").notNull(),
    rewardAmount: real("reward_amount").notNull(),
    rewardUnit: text("reward_unit").$type<RewardUnit>().notNull().default("points"),
    centsPerPoint: real("cents_per_point"),
    estValueUsd: real("est_value_usd"),
    requirementType: text("requirement_type").$type<BonusRequirementType>().notNull().default("spend"),
    amountRequired: real("amount_required"),
    windowMonths: integer("window_months"),
    annualFee: real("annual_fee"),
    feeWaivedFirstYear: integer("fee_waived_first_year", { mode: "boolean" }).notNull().default(false),
    otherCost: real("other_cost"),
    cooldownMonths: integer("cooldown_months"),
    expiresAt: text("expires_at"),
    sourceUrl: text("source_url"),
    notes: text("notes"),
    status: text("status").$type<"active" | "archived">().notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("offers_owner_idx").on(t.ownerId, t.status)],
);

export type Offer = typeof offers.$inferSelect;

/**
 * Per-owner edits to shared (seeded) catalog rows. The seed stays the default; reads
 * merge `data` over it, and catalog re-syncs never touch this table.
 */
export const catalogOverrides = sqliteTable(
  "catalog_overrides",
  {
    ownerId: text("owner_id").notNull(),
    entity: text("entity").$type<"product" | "institution">().notNull(),
    entityId: text("entity_id").notNull(),
    data: text("data", { mode: "json" }).$type<Record<string, unknown>>().notNull().default({}),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.ownerId, t.entity, t.entityId] })],
);

/** Small key/value table for app-level state (e.g. the synced catalog version). */
export const appMeta = sqliteTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export type CatalogOverride = typeof catalogOverrides.$inferSelect;

/**
 * Encrypted card / gift-card secrets (full number, expiry, CVV, PIN). One row per account,
 * in its own table so no normal query or MCP code path can select it by accident.
 * Value = AES-256-GCM(JSON payload) with AAD bound to owner, account and kind.
 */
export const accountSecrets = sqliteTable("account_secrets", {
  accountId: text("account_id")
    .primaryKey()
    .references(() => accounts.id, { onDelete: "cascade" }),
  ownerId: text("owner_id").notNull(),
  kind: text("kind").$type<AccountKind>().notNull(),
  /** Envelope format version. */
  version: integer("version").notNull().default(1),
  keyId: text("key_id").notNull(),
  iv: text("iv").notNull(),
  ciphertext: text("ciphertext").notNull(),
  /** Which fields are set (names only, never values) so the UI can mask without decrypting. */
  fields: text("fields", { mode: "json" }).$type<string[]>().notNull().default([]),
  updatedAt: updatedAt(),
});

/** Who did what with a secret, and when. Never contains values. */
export const secretAudit = sqliteTable(
  "secret_audit",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    accountId: text("account_id").notNull(),
    action: text("action").$type<"write" | "reveal" | "delete" | "reveal_denied" | "rotate">().notNull(),
    actor: text("actor").notNull(),
    at: createdAt(),
  },
  (t) => [index("secret_audit_owner_idx").on(t.ownerId, t.action, t.at)],
);

/** Platform WebAuthn credentials used to authorize secret reveals. */
export const webauthnCredentials = sqliteTable(
  "webauthn_credentials",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    publicKey: text("public_key").notNull(),
    counter: integer("counter").notNull().default(0),
    transports: text("transports", { mode: "json" }).$type<string[]>().notNull().default([]),
    deviceType: text("device_type").notNull(),
    backedUp: integer("backed_up", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
    lastUsedAt: text("last_used_at"),
  },
  (t) => [index("webauthn_credentials_owner_idx").on(t.ownerId)],
);

/** Short-lived, one-use WebAuthn ceremony challenges, keyed by their random value. */
export const webauthnChallenges = sqliteTable("webauthn_challenges", {
  challenge: text("challenge").primaryKey(),
  ownerId: text("owner_id").notNull(),
  ceremony: text("ceremony").$type<"registration" | "authentication">().notNull(),
  accountId: text("account_id").references(() => accounts.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
  createdAt: createdAt(),
}, (t) => [index("webauthn_challenges_owner_idx").on(t.ownerId)]);
