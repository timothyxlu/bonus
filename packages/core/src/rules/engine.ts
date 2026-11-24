import { addMonths, maxDate } from "../dates";
import type {
  EligibilityResult,
  EligibilityStatus,
  HistoryAccount,
  IsoDate,
  RuleProduct,
  RuleReason,
} from "../types";
import { x24Status, type PersonalCountOptions } from "./five24";
import { accountLabel, applicationDate, everFamilies, everProduct, isOpenNow, latestBonus, wasOpened } from "./history";
import { dayDrop, monthDrop, rollingWindow, type WindowItem } from "./window";

export interface EligibilityHistory {
  /** Product catalog (must contain the product being checked). */
  products: RuleProduct[];
  accounts: HistoryAccount[];
}

export interface EligibilityOptions extends PersonalCountOptions {}

export interface RuleContext {
  product: RuleProduct;
  accounts: HistoryAccount[];
  asOf: IsoDate;
  options: EligibilityOptions;
}

export type Rule = (ctx: RuleContext) => RuleReason[];

// ---------------------------------------------------------------- Chase

export const chase524: Rule = ({ product, accounts, asOf, options }) => {
  if (product.issuer !== "chase" || product.kind !== "credit_card") return [];
  const s = x24Status(accounts, asOf, 5, options);
  const out: RuleReason[] = [];
  if (!s.under) {
    out.push({
      rule: "chase_5_24",
      outcome: "block",
      message: `Chase 5/24: ${s.count} personal accounts opened in the last 24 months (limit: under 5). Count drops to 4 on ${s.eligibleFrom}.`,
      params: { count: s.count, eligibleFrom: s.eligibleFrom! },
      eligibleFrom: s.eligibleFrom,
    });
  } else {
    out.push({
      rule: "chase_5_24",
      outcome: "pass",
      message: `Chase 5/24: currently ${s.count}/24.`,
      params: { count: s.count },
    });
  }
  if (s.unknownDates.length > 0) {
    out.push({
      rule: "missing_open_dates",
      outcome: "uncertain",
      message: `${s.unknownDates.length} opened personal card(s) have no open date; the 5/24 count may be understated.`,
      params: { count: s.unknownDates.length },
    });
  }
  return out;
};

export const chaseSapphire: Rule = ({ product, accounts, asOf }) => {
  if (product.issuer !== "chase" || product.family !== "chase_sapphire") return [];
  const sapphires = accounts.filter((a) => a.issuer === "chase" && a.family === "chase_sapphire");
  const out: RuleReason[] = [];
  const holding = sapphires.filter((a) => isOpenNow(a, asOf));
  if (holding.length > 0) {
    out.push({
      rule: "chase_sapphire_holding",
      outcome: "block",
      message: `Chase Sapphire: you currently hold ${holding.map(accountLabel).join(", ")}. Close it or product-change it out of the Sapphire family first.`,
      params: { cards: holding.map(accountLabel).join(", ") },
    });
  }
  const last = latestBonus(accounts, asOf, (b) => b.issuer === "chase" && b.family === "chase_sapphire", { approximate: true });
  if (last) {
    const until = addMonths(last.date, 48);
    if (until > asOf) {
      out.push({
        rule: "chase_sapphire_48",
        outcome: "block",
        message: last.approx
          ? `Chase Sapphire: no Sapphire bonus is recorded, so the open date ${last.date} of ${accountLabel(last.account)} is used as an approximate bonus date; another Sapphire bonus is likely not available until about ${until} (48 months). Record the real bonus date for accuracy.`
          : `Chase Sapphire: a Sapphire bonus was received on ${last.date}; another is not available until ${until} (48 months).`,
        params: { lastBonus: last.date, eligibleFrom: until, approx: last.approx ? 1 : 0, cards: accountLabel(last.account) },
        eligibleFrom: until,
      });
    }
  }
  if (out.length === 0) {
    out.push({
      rule: "chase_sapphire",
      outcome: "pass",
      message: "Chase Sapphire: no Sapphire held and no Sapphire bonus in the last 48 months.",
    });
  }
  out.push({
    rule: "chase_popup",
    outcome: "info",
    message: "Chase may show an in-application pop-up declining the bonus based on past history; read it before accepting.",
  });
  return out;
};

// ---------------------------------------------------------------- Generic product rules

export const currentHolder: Rule = ({ product, accounts, asOf }) => {
  const rules = product.rules ?? {};
  if (rules.currentHolderIneligible === false || rules.lifetimeBonus) return [];
  if (product.family === "chase_sapphire") return []; // covered by chaseSapphire
  const holding = accounts.filter((a) => a.productId === product.id && isOpenNow(a, asOf));
  if (holding.length === 0) return [];
  return [
    {
      rule: "current_holder",
      outcome: "block",
      message: `You currently hold this product (${holding.map(accountLabel).join(", ")}); new-account bonuses are not offered to current cardmembers.`,
      params: { cards: holding.map(accountLabel).join(", ") },
    },
  ];
};

export const bonusCooldown: Rule = ({ product, accounts, asOf }) => {
  const months = product.rules?.bonusCooldownMonths;
  if (!months) return [];
  const scope = product.rules?.cooldownScope ?? "product";
  const byFamily = scope === "family" && !!product.family;
  const ruleId = product.issuer === "citi" ? "citi_48" : "bonus_cooldown";
  const last = latestBonus(
    accounts,
    asOf,
    (b) => (byFamily ? b.issuer === product.issuer && b.family === product.family : b.productId === product.id),
    { approximate: true },
  );
  if (last) {
    const until = addMonths(last.date, months);
    if (until > asOf) {
      return [
        {
          rule: ruleId,
          outcome: "block",
          message: last.approx
            ? `${months}-month bonus rule (${scope}): no bonus is recorded for ${accountLabel(last.account)}, so its open date ${last.date} is used as an approximate bonus date; eligible again around ${until}. Record the real bonus date (bonus_earned) for accuracy.`
            : `${months}-month bonus rule (${scope}): last bonus on ${last.date}; eligible again on ${until}.`,
          params: { months, scope, lastBonus: last.date, eligibleFrom: until, approx: last.approx ? 1 : 0, cards: accountLabel(last.account) },
          eligibleFrom: until,
        },
      ];
    }
  }
  return [
    {
      rule: ruleId,
      outcome: "pass",
      message: `${months}-month bonus rule (${scope}): no bonus in the window.`,
      params: { months, scope },
    },
  ];
};

// ---------------------------------------------------------------- Amex

export const amexLifetime: Rule = ({ product, accounts }) => {
  if (!product.rules?.lifetimeBonus) return [];
  const out: RuleReason[] = [];
  const held = accounts.filter((a) => wasOpened(a) && everProduct(a, product.id));
  if (held.length > 0) {
    out.push({
      rule: "amex_lifetime",
      outcome: "block",
      message: `Once-per-lifetime: you have had this card before (${held.map(accountLabel).join(", ")}). Welcome offers are typically not available again.`,
      params: { cards: held.map(accountLabel).join(", ") },
    });
  }
  const rank = product.rules.familyRank;
  if (product.family && rank !== undefined) {
    const higher = accounts.filter(
      (a) =>
        wasOpened(a) &&
        a.issuer === product.issuer &&
        everFamilies(a).some(
          (f) => f.productId !== product.id && f.family === product.family && (f.rank ?? -Infinity) >= rank,
        ),
    );
    if (higher.length > 0) {
      out.push({
        rule: "amex_family",
        outcome: "block",
        message: `Family rule: you have had a same-or-higher card in this family (${higher.map(accountLabel).join(", ")}), which makes this card's welcome offer unavailable.`,
        params: { cards: higher.map(accountLabel).join(", ") },
      });
    }
  }
  if (out.length === 0) {
    out.push({ rule: "amex_lifetime", outcome: "pass", message: "Once-per-lifetime / family rules: no prior card found." });
  }
  if (product.issuer === "amex") {
    out.push({
      rule: "amex_popup",
      outcome: "info",
      message: "Amex may still show a pop-up saying you are not eligible for the welcome offer; you can cancel without a hard pull.",
    });
  }
  return out;
};

export const amexCreditLimit: Rule = ({ product, accounts, asOf }) => {
  if (product.issuer !== "amex" || product.kind !== "credit_card" || product.rules?.isCharge) return [];
  const open = accounts.filter(
    (a) => a.issuer === "amex" && a.kind === "credit_card" && !a.isCharge && !a.isAuthorizedUser && isOpenNow(a, asOf),
  );
  if (open.length >= 5) {
    return [
      {
        rule: "amex_credit_limit",
        outcome: "block",
        message: `Amex credit card limit: you hold ${open.length} Amex credit cards (charge cards excluded); Amex generally allows about 5. Close one first.`,
        params: { count: open.length },
      },
    ];
  }
  return [
    {
      rule: "amex_credit_limit",
      outcome: open.length === 4 ? "info" : "pass",
      message: `Amex credit card limit: ${open.length}/5 Amex credit cards open.`,
      params: { count: open.length },
    },
  ];
};

export const amexVelocity: Rule = ({ product, accounts, asOf }) => {
  if (product.issuer !== "amex" || product.kind !== "credit_card" || product.rules?.isCharge) return [];
  const approvals: WindowItem<HistoryAccount>[] = [];
  for (const a of accounts) {
    if (a.issuer !== "amex" || a.kind !== "credit_card" || a.isCharge || a.isAuthorizedUser || !wasOpened(a)) continue;
    if (a.openedAt) approvals.push({ date: a.openedAt, dropsOn: a.openedAt, ref: a });
  }
  const five = rollingWindow(approvals.map((i) => ({ ...i, dropsOn: dayDrop(i.date, 5) })), asOf, 1);
  const ninety = rollingWindow(approvals.map((i) => ({ ...i, dropsOn: dayDrop(i.date, 90) })), asOf, 2);
  const out: RuleReason[] = [];
  if (five.atLimit)
    out.push({
      rule: "amex_1_5",
      outcome: "block",
      message: `Amex 1/5: an Amex credit card was approved within the last 5 days; wait until ${five.clearsOn}.`,
      params: { eligibleFrom: five.clearsOn! },
      eligibleFrom: five.clearsOn,
    });
  if (ninety.atLimit)
    out.push({
      rule: "amex_2_90",
      outcome: "block",
      message: `Amex 2/90: ${ninety.count} Amex credit cards approved in the last 90 days; wait until ${ninety.clearsOn}.`,
      params: { count: ninety.count, eligibleFrom: ninety.clearsOn! },
      eligibleFrom: ninety.clearsOn,
    });
  return out;
};

// ---------------------------------------------------------------- Citi

export const citiVelocity: Rule = ({ product, accounts, asOf }) => {
  if (product.issuer !== "citi" || product.kind !== "credit_card") return [];
  const apps = accounts
    .filter((a) => a.issuer === "citi" && a.kind === "credit_card" && !a.isAuthorizedUser)
    .map((a) => ({ a, date: applicationDate(a) }))
    .filter((x): x is { a: HistoryAccount; date: IsoDate } => !!x.date);
  const out: RuleReason[] = [];
  const w8 = rollingWindow(apps.map(({ a, date }) => ({ date, dropsOn: dayDrop(date, 8), ref: a })), asOf, 1);
  out.push(
    w8.atLimit
      ? {
          rule: "citi_1_8",
          outcome: "block",
          message: `Citi 1/8: a Citi application was made within the last 8 days; wait until ${w8.clearsOn}.`,
          params: { eligibleFrom: w8.clearsOn! },
          eligibleFrom: w8.clearsOn,
        }
      : { rule: "citi_1_8", outcome: "pass", message: "Citi 1/8: no Citi application in the last 8 days." },
  );
  if (product.ownerType === "personal") {
    const personal = apps.filter(({ a }) => a.ownerType === "personal");
    const w65 = rollingWindow(personal.map(({ a, date }) => ({ date, dropsOn: dayDrop(date, 65), ref: a })), asOf, 2);
    out.push(
      w65.atLimit
        ? {
            rule: "citi_2_65",
            outcome: "block",
            message: `Citi 2/65: ${w65.count} personal Citi applications in the last 65 days; wait until ${w65.clearsOn}.`,
            params: { count: w65.count, eligibleFrom: w65.clearsOn! },
            eligibleFrom: w65.clearsOn,
          }
        : {
            rule: "citi_2_65",
            outcome: "pass",
            message: `Citi 2/65: ${w65.count} personal Citi application(s) in the last 65 days.`,
            params: { count: w65.count },
          },
    );
  }
  return out;
};

// ---------------------------------------------------------------- Bank of America

const BOA_WINDOWS = [
  { months: 2, limit: 2 },
  { months: 12, limit: 3 },
  { months: 24, limit: 4 },
] as const;

export const boa234: Rule = ({ product, accounts, asOf }) => {
  if (product.issuer !== "boa" || product.kind !== "credit_card" || product.ownerType !== "personal") return [];
  const opened = accounts.filter(
    (a) =>
      a.issuer === "boa" &&
      a.kind === "credit_card" &&
      a.ownerType === "personal" &&
      !a.isAuthorizedUser &&
      wasOpened(a) &&
      a.openedAt,
  );
  const blocks: RuleReason[] = [];
  const counts: string[] = [];
  for (const { months, limit } of BOA_WINDOWS) {
    const w = rollingWindow(
      opened.map((a) => ({ date: a.openedAt!, dropsOn: monthDrop(a.openedAt!, months, false), ref: a })),
      asOf,
      limit,
    );
    counts.push(`${w.count}/${months}mo`);
    if (w.atLimit) {
      blocks.push({
        rule: "boa_2_3_4",
        outcome: "block",
        message: `BoA 2/3/4: ${w.count} BoA cards opened in the last ${months} months (max ${limit - 1}); wait until ${w.clearsOn}.`,
        params: { count: w.count, months, limit, eligibleFrom: w.clearsOn! },
        eligibleFrom: w.clearsOn,
      });
    }
  }
  if (blocks.length > 0) return blocks;
  return [
    { rule: "boa_2_3_4", outcome: "pass", message: `BoA 2/3/4: ${counts.join(", ")}.`, params: { counts: counts.join(", ") } },
  ];
};

// ---------------------------------------------------------------- Barclays

export const barclays624: Rule = ({ product, accounts, asOf, options }) => {
  if (product.issuer !== "barclays" || product.kind !== "credit_card") return [];
  const s = x24Status(accounts, asOf, 7, options); // 6/24 means 6 is still OK; 7+ is the soft cut-off
  if (!s.under) {
    return [
      {
        rule: "barclays_6_24",
        outcome: "block",
        message: `Barclays 6/24: ${s.count} new accounts in the last 24 months (more than 6). Count drops to 6 on ${s.eligibleFrom}.`,
        params: { count: s.count, eligibleFrom: s.eligibleFrom! },
        eligibleFrom: s.eligibleFrom,
      },
    ];
  }
  return [
    {
      rule: "barclays_6_24",
      outcome: s.count === 6 ? "uncertain" : "pass",
      message:
        s.count === 6
          ? "Barclays 6/24: exactly 6 new accounts in the last 24 months - borderline."
          : `Barclays 6/24: ${s.count} new accounts in the last 24 months.`,
      params: { count: s.count },
    },
  ];
};

// ---------------------------------------------------------------- Engine

export const DEFAULT_RULES: Rule[] = [
  chase524,
  chaseSapphire,
  currentHolder,
  bonusCooldown,
  amexLifetime,
  amexCreditLimit,
  amexVelocity,
  citiVelocity,
  boa234,
  barclays624,
];

export function combineReasons(reasons: RuleReason[]): { status: EligibilityStatus; eligibleFrom?: IsoDate } {
  const blocks = reasons.filter((r) => r.outcome === "block");
  if (blocks.length > 0) {
    const allDated = blocks.every((b) => b.eligibleFrom);
    return { status: "blocked", eligibleFrom: allDated ? maxDate(...blocks.map((b) => b.eligibleFrom)) : undefined };
  }
  if (reasons.some((r) => r.outcome === "uncertain")) return { status: "uncertain" };
  return { status: "eligible" };
}

/** Evaluate a product against an applicant's history. */
export function evaluateProduct(
  product: RuleProduct,
  accounts: HistoryAccount[],
  asOf: IsoDate,
  options: EligibilityOptions = {},
  rules: Rule[] = DEFAULT_RULES,
): EligibilityResult {
  const ctx: RuleContext = { product, accounts, asOf, options };
  const reasons = rules.flatMap((r) => r(ctx));
  if (reasons.length === 0) {
    reasons.push({
      rule: "no_rules",
      outcome: "uncertain",
      message: `No issuer-specific rules are modelled for ${product.issuer}; check the offer terms.`,
      params: { issuer: product.issuer },
    });
  }
  const { status, eligibleFrom } = combineReasons(reasons);
  return { productId: product.id, productName: product.name, status, reasons, eligibleFrom, asOf };
}

/**
 * checkEligibility(productId, history, asOf) -> eligible | blocked | uncertain, with reasons.
 * Throws if the product is not in `history.products`.
 */
export function checkEligibility(
  productId: string,
  history: EligibilityHistory,
  asOf: IsoDate,
  options: EligibilityOptions = {},
): EligibilityResult {
  const product = history.products.find((p) => p.id === productId);
  if (!product) throw new Error(`Unknown product: ${productId}`);
  return evaluateProduct(product, history.accounts, asOf, options);
}
