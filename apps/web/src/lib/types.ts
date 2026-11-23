import type {
  AccountKind,
  AccountStatus,
  BenefitPeriod,
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
  type: string;
  ownerId: string | null;
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
  used: number;
  remaining: number;
  unused: boolean;
  currentPeriod: { start: string; end: string };
  uses: BenefitUse[];
  accountLabel?: string;
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
}

export interface Dashboard {
  today: string;
  five24: X24Status;
  deadlines: UpcomingBonus[];
  unusedBenefits: Benefit[];
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
