import type {
  AccountKind,
  AccountStatus,
  BenefitPeriod,
  BenefitUnit,
  BonusRequirementType,
  BonusStatus,
  EligibilityResult,
  EventType,
  OwnerType,
  ProductRules,
  RewardUnit,
  X24Status,
} from "@bonus/core";

export interface Institution {
  id: string;
  name: string;
  type: "issuer" | "bank" | "merchant";
  ownerId: string | null;
  isCatalog: boolean;
  customized: boolean;
}

export interface Product {
  id: string;
  institutionId: string;
  institutionName: string;
  name: string;
  kind: AccountKind;
  ownerType: OwnerType;
  family: string | null;
  annualFee: number;
  network: string | null;
  currency: string | null;
  rules: ProductRules;
  isCatalog: boolean;
  customized: boolean;
  archived: boolean;
  accountCount?: number;
}

export interface Progress {
  ratio: number;
  remaining: number;
  daysLeft: number | null;
  overdue: boolean;
  active: boolean;
}

export interface Bonus extends Progress {
  id: string;
  accountId: string;
  productId: string | null;
  description: string | null;
  requirementType: BonusRequirementType;
  amountRequired: number | null;
  progress: number;
  deadline: string | null;
  rewardAmount: number | null;
  rewardUnit: RewardUnit;
  status: BonusStatus;
  earnedAt: string | null;
}

export interface BenefitUse {
  id: string;
  benefitId: string;
  usedOn: string;
  amount: number;
  note: string | null;
}

export interface Benefit {
  id: string;
  accountId: string;
  name: string;
  amount: number;
  period: BenefitPeriod;
  resetRule: string | null;
  notes: string | null;
  active: boolean;
  unit: BenefitUnit;
  valueDescription: string | null;
  estValueUsd: number | null;
  everyMonths: number | null;
  amountByPeriod: Record<string, number> | null;
  enrollmentRequired: boolean;
  limitations: string | null;
  sourceUrl: string | null;
  startsAt: string | null;
  endsAt: string | null;
  used: number;
  remaining: number;
  unused: boolean;
  periodAmount: number;
  inEffect: boolean;
  annualAmount?: number;
  annualValueUsd?: number | null;
  currentPeriod: { start: string; end: string; index: number | null };
  uses: BenefitUse[];
  accountLabel?: string;
}

export interface HotelCertificate {
  id: string;
  accountId: string;
  benefitId: string | null;
  name: string;
  hotelProgram: string;
  expiresOn: string;
  usedAt: string | null;
  notes: string | null;
  status: "unused" | "used" | "expired";
  daysUntilExpiration: number;
  accountLabel: string;
  productName: string | null;
  productProgram: string | null;
}

export type LoyaltyCategory = "flight" | "hotel" | "credit_card";
export interface LoyaltyBalance {
  id: string;
  category: LoyaltyCategory;
  program: string;
  balance: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccountEvent {
  id: string;
  accountId: string;
  type: EventType;
  date: string;
  fromProductId: string | null;
  toProductId: string | null;
  note: string | null;
}

export interface AccountSummary {
  id: string;
  kind: AccountKind;
  ownerType: OwnerType;
  productId: string | null;
  institutionId: string | null;
  institutionName: string | null;
  productName: string | null;
  nickname: string | null;
  last4: string | null;
  status: AccountStatus;
  appliedAt: string | null;
  openedAt: string | null;
  closedAt: string | null;
  isAuthorizedUser: boolean;
  notes: string | null;
  details: Record<string, unknown>;
  family: string | null;
  annualFee: number | null;
  network: string | null;
  currency: string | null;
  label: string;
  activeBonus: Bonus | null;
  unusedBenefits: number;
  benefitCount: number;
}

export interface AccountDetail extends AccountSummary {
  events: AccountEvent[];
  bonuses: Bonus[];
  benefits: Benefit[];
}

export interface UpcomingBonus extends Bonus {
  accountLabel: string;
  productName: string | null;
  kind: AccountKind;
  institutionId: string | null;
  institutionName: string | null;
  updatedAt: string;
}

export type UnitTotals = Partial<Record<RewardUnit, number>>;

export interface KindStats {
  total: number;
  open: number;
  activeBonuses: number;
  postedThisYear: number;
  annualFees?: number;
  faceValue?: number;
  saved?: number;
  avgDiscount?: number | null;
}

export interface Dashboard {
  today: string;
  five24: X24Status;
  deadlines: UpcomingBonus[];
  unusedBenefits: Benefit[];
  rewards: { earnedThisYear: UnitTotals; pending: UnitTotals; activeCount: number; year: string };
  byKind: Record<AccountKind, KindStats>;
  stats: { openAccounts: number; totalAccounts: number; annualFees: number; activeBonuses: number };
}

export type { EligibilityResult, X24Status };

export interface EligibilityOverviewRow {
  productId: string;
  productName: string;
  issuer: string;
  status: EligibilityResult["status"];
  eligibleFrom?: string;
  blockedBy: string[];
}

export interface Opportunity {
  id: string;
  kind: AccountKind;
  productId: string | null;
  productName: string | null;
  institutionId: string;
  institutionName: string;
  currency: string | null;
  title: string;
  rewardAmount: number;
  rewardUnit: RewardUnit;
  centsPerPoint: number | null;
  estValueUsd: number | null;
  requirementType: BonusRequirementType;
  amountRequired: number | null;
  windowMonths: number | null;
  annualFee: number | null;
  feeWaivedFirstYear: boolean;
  otherCost: number | null;
  cooldownMonths: number | null;
  expiresAt: string | null;
  sourceUrl: string | null;
  notes: string | null;
  status: "active" | "archived";
  expired: boolean;
  updatedAt: string;
  value: { grossUsd: number; costUsd: number; netUsd: number; centsPerPoint: number; returnOnRequired: number | null };
  eligibility: { status: EligibilityResult["status"]; reasons: EligibilityResult["reasons"]; eligibleFrom?: string };
}

export interface UserPreferences {
  /** USPS two-letter code (50 states + DC), or null when not set. */
  homeState: string | null;
  updatedAt: string | null;
}
