import { sql } from "drizzle-orm";
import { check, index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type {
  AccountKind,
  AccountStatus,
  BenefitPeriod,
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
    last4: text("last4"),
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
    check("accounts_last4_check", sql`${t.last4} IS NULL OR ${t.last4} GLOB '[0-9][0-9][0-9][0-9]'`),
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

export type Institution = typeof institutions.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type AccountEvent = typeof events.$inferSelect;
export type Bonus = typeof bonuses.$inferSelect;
export type Benefit = typeof benefits.$inferSelect;
export type BenefitUse = typeof benefitUses.$inferSelect;
