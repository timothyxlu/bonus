/** Input validation shared by the REST API and the MCP tools. */
import {
  ACCOUNT_KINDS,
  ACCOUNT_STATUSES,
  BENEFIT_PERIODS,
  BENEFIT_UNITS,
  BONUS_REQUIREMENT_TYPES,
  BONUS_STATUSES,
  EVENT_TYPES,
  INSTITUTION_TYPES,
  NETWORKS,
  OWNER_TYPES,
  REWARD_UNITS,
  isIsoDate,
} from "@bonus/core";
import { z } from "zod";

export const isoDate = z.string().refine(isIsoDate, { message: "Expected a date in YYYY-MM-DD format" });
const optDate = isoDate.nullish();
const optText = (max = 500) => z.string().trim().max(max).nullish();
const sourceUrl = z
  .string()
  .trim()
  .max(500)
  .refine((value) => {
    try {
      return ["http:", "https:"].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }, "URL must use http or https")
  .nullish();

/** Trailing 4 or 5 digits (Amex shows 5). Rejects anything that looks like a full number. */
export const last4 = z
  .string()
  .trim()
  .regex(/^\d{4,5}$/, { message: "last4 must be the last 4 or 5 digits only (never store full card or account numbers)" });

export const productRulesSchema = z
  .object({
    currentHolderIneligible: z.boolean().optional(),
    bonusCooldownMonths: z.number().int().min(0).max(120).optional(),
    cooldownScope: z.enum(["product", "family"]).optional(),
    lifetimeBonus: z.boolean().optional(),
    familyRank: z.number().int().min(0).max(100).optional(),
    isCharge: z.boolean().optional(),
    reportsToPersonal: z.boolean().optional(),
  })
  .strict();

export const institutionInput = z.object({
  id: z.string().trim().regex(/^[a-z0-9_-]{2,40}$/).optional(),
  name: z.string().trim().min(1).max(100),
  type: z.enum(INSTITUTION_TYPES).default("issuer"),
});

export const productInput = z.object({
  id: z.string().trim().regex(/^[a-z0-9_-]{2,60}$/).optional(),
  institutionId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  kind: z.enum(ACCOUNT_KINDS).default("credit_card"),
  ownerType: z.enum(OWNER_TYPES).default("personal"),
  family: optText(60),
  annualFee: z.number().min(0).max(100000).default(0),
  network: z.enum(NETWORKS).nullish(),
  currency: optText(80),
  rules: productRulesSchema.default({}),
});
/** Rule fields in a patch: a value sets it, null clears it, absent keeps it. */
export const productRulesPatch = z
  .object({
    currentHolderIneligible: z.boolean().nullable().optional(),
    bonusCooldownMonths: z.number().int().min(0).max(120).nullable().optional(),
    cooldownScope: z.enum(["product", "family"]).nullable().optional(),
    lifetimeBonus: z.boolean().nullable().optional(),
    familyRank: z.number().int().min(0).max(100).nullable().optional(),
    isCharge: z.boolean().nullable().optional(),
    reportsToPersonal: z.boolean().nullable().optional(),
  })
  .strict();

export const productPatch = z
  .object({
    institutionId: z.string().min(1).optional(),
    name: z.string().trim().min(1).max(120).optional(),
    kind: z.enum(ACCOUNT_KINDS).optional(),
    ownerType: z.enum(OWNER_TYPES).optional(),
    family: z.string().trim().max(60).nullable().optional(),
    annualFee: z.number().min(0).max(100000).optional(),
    network: z.enum(NETWORKS).nullable().optional(),
    currency: z.string().trim().max(80).nullable().optional(),
    rules: productRulesPatch.optional(),
  })
  .strict();

export const institutionPatch = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    type: z.enum(INSTITUTION_TYPES).optional(),
  })
  .strict();

export const archiveInput = z.object({ archived: z.boolean().default(true) });

const accountBase = z.object({
  kind: z.enum(ACCOUNT_KINDS).default("credit_card"),
  ownerType: z.enum(OWNER_TYPES).optional(),
  productId: z.string().min(1).nullish(),
  institutionId: z.string().min(1).nullish(),
  nickname: optText(120),
  last4: last4.nullish(),
  status: z.enum(ACCOUNT_STATUSES).default("open"),
  appliedAt: optDate,
  openedAt: optDate,
  closedAt: optDate,
  isAuthorizedUser: z.boolean().default(false),
  details: z.record(z.string(), z.unknown()).default({}),
  notes: optText(2000),
});
export const accountInput = accountBase.refine((a) => a.productId || a.institutionId, {
  message: "productId or institutionId is required",
});
// zod 4's .partial() keeps .default()s, which would reset omitted fields on PATCH; drop them first.
export const accountPatch = accountBase
  .extend({
    kind: z.enum(ACCOUNT_KINDS).optional(),
    status: z.enum(ACCOUNT_STATUSES).optional(),
    isAuthorizedUser: z.boolean().optional(),
    details: z.record(z.string(), z.unknown()).optional(),
  })
  .partial();

export const eventInput = z.object({
  type: z.enum(EVENT_TYPES),
  date: isoDate,
  fromProductId: z.string().nullish(),
  toProductId: z.string().nullish(),
  note: optText(2000),
  data: z.record(z.string(), z.unknown()).default({}),
});

/** One condition of a multi-step bonus (e.g. deposit $X by a date, then hold $X through a date). */
export const bonusStep = z
  .object({
    type: z.enum(BONUS_REQUIREMENT_TYPES).default("other"),
    amount: z.number().min(0).nullish().transform((v) => v ?? null),
    progress: z.number().min(0).default(0),
    dueBy: optDate.transform((v) => v ?? null),
    holdFrom: optDate.transform((v) => v ?? null),
    holdUntil: optDate.transform((v) => v ?? null),
    description: optText(300).transform((v) => v ?? null),
    done: z.boolean().default(false),
  })
  .refine((s) => !s.holdFrom || !s.holdUntil || s.holdFrom <= s.holdUntil, { message: "holdFrom must be on or before holdUntil" });

export const bonusInput = z.object({
  productId: z.string().nullish(),
  description: optText(500),
  requirementType: z.enum(BONUS_REQUIREMENT_TYPES).default("spend"),
  amountRequired: z.number().min(0).nullish(),
  progress: z.number().min(0).default(0),
  deadline: optDate,
  rewardAmount: z.number().min(0).nullish(),
  rewardUnit: z.enum(REWARD_UNITS).default("points"),
  status: z.enum(BONUS_STATUSES).default("in_progress"),
  earnedAt: optDate,
  /** Multi-step conditions; when present they replace amountRequired/progress for progress tracking. */
  steps: z.array(bonusStep).max(10).default([]),
});
// Without the defaults, so a PATCH only changes the fields it sends (see accountPatch).
export const bonusPatch = bonusInput
  .extend({
    requirementType: z.enum(BONUS_REQUIREMENT_TYPES).optional(),
    progress: z.number().min(0).optional(),
    rewardUnit: z.enum(REWARD_UNITS).optional(),
    status: z.enum(BONUS_STATUSES).optional(),
    steps: z.array(bonusStep).max(10).optional(),
  })
  .partial();

const benefitFields = {
  name: z.string().trim().min(1).max(120),
  amount: z.number().min(0),
  period: z.enum(BENEFIT_PERIODS),
  unit: z.enum(BENEFIT_UNITS),
  valueDescription: optText(200),
  estValueUsd: z.number().min(0).nullish(),
  /** every_n_years: give years (fractional ok, e.g. 4.5) or months. */
  everyYears: z.number().positive().max(20).nullish(),
  everyMonths: z.number().int().min(1).max(240).nullish(),
  amountByPeriod: z.record(z.string().regex(/^(1[0-2]|[1-9])$/, { message: "keys are period numbers 1-12" }), z.number().min(0)).nullish(),
  enrollmentRequired: z.boolean(),
  limitations: optText(1000),
  sourceUrl,
  startsAt: optDate,
  endsAt: optDate,
  resetRule: optText(200),
  notes: optText(1000),
  active: z.boolean(),
};
export const benefitInput = z.object({
  ...benefitFields,
  amount: benefitFields.amount.default(0),
  unit: benefitFields.unit.default("USD"),
  enrollmentRequired: benefitFields.enrollmentRequired.default(false),
  active: benefitFields.active.default(true),
});
export const benefitPatch = z
  .object({
    name: benefitFields.name.optional(),
    amount: benefitFields.amount.optional(),
    period: benefitFields.period.optional(),
    unit: benefitFields.unit.optional(),
    valueDescription: benefitFields.valueDescription,
    estValueUsd: benefitFields.estValueUsd,
    everyYears: benefitFields.everyYears,
    everyMonths: benefitFields.everyMonths,
    amountByPeriod: benefitFields.amountByPeriod,
    enrollmentRequired: benefitFields.enrollmentRequired.optional(),
    limitations: benefitFields.limitations,
    sourceUrl: benefitFields.sourceUrl,
    startsAt: benefitFields.startsAt,
    endsAt: benefitFields.endsAt,
    resetRule: benefitFields.resetRule,
    notes: benefitFields.notes,
    active: benefitFields.active.optional(),
  })
  .strict();

export const benefitUseInput = z.object({
  usedOn: isoDate,
  /** 0 / omitted = whatever is left this period (USD), or one unit (free night etc.). */
  amount: z.number().min(0).default(0),
  note: optText(500),
});

export const hotelCertificateInput = z
  .object({
    benefitId: z.string().min(1).nullish(),
    name: z.string().trim().min(1).max(120).default("Free night certificate"),
    hotelProgram: z.string().trim().min(1).max(120),
    expiresOn: isoDate,
    usedAt: optDate,
    notes: optText(1000),
  })
  .strict();

export const hotelCertificatePatch = z
  .object({
    benefitId: z.string().min(1).nullable().optional(),
    name: z.string().trim().min(1).max(120).optional(),
    hotelProgram: z.string().trim().min(1).max(120).optional(),
    expiresOn: isoDate.optional(),
    usedAt: optDate,
    notes: optText(1000),
  })
  .strict();

export const hotelCertificateUseInput = z.object({ usedAt: isoDate.optional() }).strict();

export const LOYALTY_CATEGORIES = ["flight", "hotel", "credit_card"] as const;
const loyaltyFields = {
  category: z.enum(LOYALTY_CATEGORIES),
  program: z.string().trim().min(1).max(120),
  balance: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  notes: optText(1000),
};
export const loyaltyBalanceInput = z.object(loyaltyFields).strict();
export const loyaltyBalancePatch = z
  .object({
    category: loyaltyFields.category.optional(),
    program: loyaltyFields.program.optional(),
    balance: loyaltyFields.balance.optional(),
    notes: loyaltyFields.notes,
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: "At least one field is required" });

/** Bulk import format (JSON). See docs/IMPORT.md. */
export const importAccount = accountBase.extend({
  /** Catalog product id, or a product name to match case-insensitively. */
  product: z.string().nullish(),
  issuer: z.string().nullish(),
  events: z.array(eventInput).default([]),
  bonuses: z.array(bonusInput).default([]),
  benefits: z.array(benefitInput).default([]),
});
export const importPayload = z.object({
  version: z.literal(1).default(1),
  accounts: z.array(importAccount).max(2000).default([]),
  loyaltyBalances: z.array(loyaltyBalanceInput).max(2000).default([]),
  /** Offers for the 机会 page; `product` / `issuer` resolve like accounts. */
  offers: z.array(z.record(z.string(), z.unknown())).max(500).default([]),
});
export type ImportPayload = z.infer<typeof importPayload>;

/** One condition of a multi-step offer, in days from opening. */
export const offerStep = z
  .object({
    type: z.enum(BONUS_REQUIREMENT_TYPES).default("other"),
    amount: z.number().min(0).nullish().transform((v) => v ?? null),
    withinDays: z.number().int().min(0).max(1100).nullish().transform((v) => v ?? null),
    holdDays: z.number().int().min(0).max(1100).nullish().transform((v) => v ?? null),
    description: optText(300).transform((v) => v ?? null),
  })
  .refine((s) => s.withinDays === null || s.holdDays === null || s.withinDays <= s.holdDays, { message: "withinDays must not be after holdDays" });

export const offerInput = z
  .object({
    kind: z.enum(ACCOUNT_KINDS),
    productId: z.string().min(1).nullish(),
    institutionId: z.string().min(1).nullish(),
    title: z.string().trim().min(1).max(160),
    rewardAmount: z.number().min(0),
    rewardUnit: z.enum(REWARD_UNITS).default("points"),
    centsPerPoint: z.number().min(0).max(100).nullish(),
    estValueUsd: z.number().min(0).nullish(),
    requirementType: z.enum(BONUS_REQUIREMENT_TYPES).default("spend"),
    amountRequired: z.number().min(0).nullish(),
    windowMonths: z.number().int().min(0).max(60).nullish(),
    annualFee: z.number().min(0).nullish(),
    feeWaivedFirstYear: z.boolean().default(false),
    otherCost: z.number().min(0).nullish(),
    cooldownMonths: z.number().int().min(0).max(120).nullish(),
    steps: z.array(offerStep).max(10).default([]),
    expiresAt: optDate,
    sourceUrl,
    notes: optText(2000),
  })
  .refine((o) => o.productId || o.institutionId, { message: "productId or institutionId is required" });
export const offerPatch = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  rewardAmount: z.number().min(0).optional(),
  rewardUnit: z.enum(REWARD_UNITS).optional(),
  centsPerPoint: z.number().min(0).max(100).nullish(),
  estValueUsd: z.number().min(0).nullish(),
  requirementType: z.enum(BONUS_REQUIREMENT_TYPES).optional(),
  amountRequired: z.number().min(0).nullish(),
  windowMonths: z.number().int().min(0).max(60).nullish(),
  annualFee: z.number().min(0).nullish(),
  feeWaivedFirstYear: z.boolean().optional(),
  otherCost: z.number().min(0).nullish(),
  cooldownMonths: z.number().int().min(0).max(120).nullish(),
  steps: z.array(offerStep).max(10).optional(),
  expiresAt: optDate,
  sourceUrl,
  notes: optText(2000),
  status: z.enum(["active", "archived"]).optional(),
});
export const claimOfferInput = z.object({ openedAt: isoDate.optional(), last4: last4.nullish(), nickname: optText(120) });
