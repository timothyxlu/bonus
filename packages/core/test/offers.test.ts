import { describe, expect, it } from "vitest";
import { centsPerUnit, checkOfferEligibility, valueOffer, type OfferLike } from "../src";
import { acct, products } from "./helpers";

const asOf = "2026-11-23";
const base: OfferLike = { id: "o1", kind: "credit_card", institutionId: "chase", title: "x", rewardAmount: 90000, rewardUnit: "points", requirementType: "spend", amountRequired: 8000 };

describe("offer valuation", () => {
  it("uses programme valuations, overrides and fees", () => {
    expect(centsPerUnit("points", "Chase Ultimate Rewards")).toBe(1.5);
    expect(centsPerUnit("points", "Hilton Honors")).toBe(0.5);
    expect(centsPerUnit("miles", null)).toBe(1.2);
    expect(centsPerUnit("points", "Hilton Honors", 0.7)).toBe(0.7);
    const v = valueOffer(base, { currency: "Chase Ultimate Rewards", productAnnualFee: 95 });
    expect(v.grossUsd).toBe(1350);
    expect(v.netUsd).toBe(1255);
    expect(v.returnOnRequired).toBeCloseTo(1255 / 8000);
    expect(valueOffer({ ...base, feeWaivedFirstYear: true }, { productAnnualFee: 95 }).costUsd).toBe(0);
    expect(valueOffer({ ...base, estValueUsd: 1000, otherCost: 50 }).netUsd).toBe(950);
    expect(valueOffer({ ...base, rewardAmount: 300, rewardUnit: "USD", amountRequired: 0 }).returnOnRequired).toBeNull();
  });
});

describe("offer eligibility", () => {
  it("credit cards reuse the issuer rules engine", () => {
    const r = checkOfferEligibility({ ...base, productId: "chase-sapphire-reserve" }, { products, accounts: [acct("chase-sapphire-preferred", "2025-01-01")] }, asOf);
    expect(r.status).toBe("blocked");
    expect(r.reasons.some((x) => x.rule === "chase_sapphire_holding")).toBe(true);
  });

  it("bank offers: institution cooldown blocks until a date", () => {
    const old = { ...acct("discover-it-cash-back", "2025-03-01"), kind: "bank_account" as const, issuer: "chase", productId: null, bonusDates: ["2025-06-01"] };
    const o: OfferLike = { ...base, kind: "bank_account", institutionId: "chase", rewardUnit: "USD", rewardAmount: 300, requirementType: "direct_deposit", cooldownMonths: 24 };
    const r = checkOfferEligibility(o, { products, accounts: [{ ...old, status: "closed", closedAt: "2026-01-01" }] }, asOf);
    expect(r.status).toBe("blocked");
    expect(r.eligibleFrom).toBe("2027-06-01");
    const open = checkOfferEligibility({ ...o, cooldownMonths: 12 }, { products, accounts: [old] }, asOf);
    expect(open.status).toBe("uncertain"); // existing customer
  });

  it("expired offers are blocked", () => {
    expect(checkOfferEligibility({ ...base, kind: "gift_card", expiresAt: "2026-11-01" }, { products, accounts: [] }, asOf).status).toBe("blocked");
    expect(checkOfferEligibility({ ...base, kind: "gift_card" }, { products, accounts: [] }, asOf).status).toBe("eligible");
  });
});
