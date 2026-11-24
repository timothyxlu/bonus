import { describe, expect, it } from "vitest";
import { addDays, addMonths, annualAmount, benefitInEffect, cycleFor, daysBetween, isIsoDate, monthDrop, periodFor, benefitStatus, bonusProgress } from "../src";

describe("dates", () => {
  it("adds months with end-of-month clamping", () => {
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonths("2023-01-31", 1)).toBe("2023-02-28");
    expect(addMonths("2024-03-15", 24)).toBe("2026-03-15");
    expect(addMonths("2024-03-15", -3)).toBe("2023-12-15");
  });
  it("adds days and diffs", () => {
    expect(addDays("2024-12-30", 3)).toBe("2025-01-02");
    expect(daysBetween("2025-01-01", "2025-03-01")).toBe(59);
  });
  it("validates ISO dates", () => {
    expect(isIsoDate("2025-02-29")).toBe(false);
    expect(isIsoDate("2024-02-29")).toBe(true);
    expect(isIsoDate("2024-2-1")).toBe(false);
  });
  it("conservative month drop rounds to month after", () => {
    expect(monthDrop("2024-03-15", 24, true)).toBe("2026-04-01");
    expect(monthDrop("2024-03-15", 24, false)).toBe("2026-03-15");
  });
});

describe("benefit periods", () => {
  it("calendar periods", () => {
    expect(periodFor("monthly", "2026-11-23")).toMatchObject({ start: "2026-11-01", end: "2026-12-01" });
    expect(periodFor("quarterly", "2026-11-23")).toMatchObject({ start: "2026-10-01", end: "2027-01-01" });
    expect(periodFor("semiannual", "2026-03-02")).toMatchObject({ start: "2026-01-01", end: "2026-07-01" });
    expect(periodFor("annual", "2026-03-02")).toMatchObject({ start: "2026-01-01", end: "2027-01-01" });
  });
  it("cardmember year resets on anniversary", () => {
    expect(periodFor("cardmember_year", "2026-11-23", "2024-05-10")).toMatchObject({ start: "2026-05-10", end: "2027-05-10" });
    expect(periodFor("cardmember_year", "2026-05-09", "2024-05-10")).toMatchObject({ start: "2025-05-10", end: "2026-05-10" });
  });
  it("computes remaining and unused", () => {
    const s = benefitStatus({ period: "monthly", amount: 10 }, [{ usedOn: "2026-11-02", amount: 4 }, { usedOn: "2026-10-30", amount: 10 }], "2026-11-23");
    expect(s.used).toBe(4);
    expect(s.remaining).toBe(6);
    expect(s.unused).toBe(true);
    const full = benefitStatus({ period: "monthly", amount: 10 }, [{ usedOn: "2026-11-02", amount: 10 }], "2026-11-23");
    expect(full.unused).toBe(false);
  });
});

describe("benefit periods: new shapes", () => {
  it("semiannual halves are Jan-Jun / Jul-Dec with index", () => {
    expect(periodFor("semiannual", "2026-06-30")).toEqual({ start: "2026-01-01", end: "2026-07-01", index: 1 });
    expect(periodFor("semiannual", "2026-07-01")).toEqual({ start: "2026-07-01", end: "2027-01-01", index: 2 });
  });

  it("cardmember year handles a Feb 29 anniversary in non-leap years", () => {
    // anchor 2024-02-29: anniversaries 2025-02-28, 2026-02-28, 2028-02-29
    expect(periodFor("cardmember_year", "2026-02-27", "2024-02-29")).toMatchObject({ start: "2025-02-28", end: "2026-02-28" });
    expect(periodFor("cardmember_year", "2026-02-28", "2024-02-29")).toMatchObject({ start: "2026-02-28", end: "2027-02-28" });
    expect(periodFor("cardmember_year", "2028-02-29", "2024-02-29")).toMatchObject({ start: "2028-02-29", end: "2029-02-28" });
    expect(periodFor("cardmember_year", "2024-02-29", "2024-02-29")).toMatchObject({ start: "2024-02-29", end: "2025-02-28" });
  });

  it("every_n_years cycles from the anchor, including fractional years (months)", () => {
    expect(cycleFor("2022-05-10", 48, "2026-05-09")).toMatchObject({ start: "2022-05-10", end: "2026-05-10" });
    expect(cycleFor("2022-05-10", 48, "2026-05-10")).toMatchObject({ start: "2026-05-10", end: "2030-05-10" });
    // 4.5 years = 54 months
    expect(periodFor("every_n_years", "2026-11-23", "2022-01-15", 54)).toMatchObject({ start: "2026-07-15", end: "2031-01-15" });
    // before the anchor
    expect(cycleFor("2027-01-01", 48, "2026-06-01")).toMatchObject({ end: "2027-01-01" });
  });

  it("per-period overrides: Uber-style $15/month with $35 in December", () => {
    const uber = { period: "monthly" as const, amount: 15, amountByPeriod: { "12": 35 } };
    expect(benefitStatus(uber, [], "2026-11-30").periodAmount).toBe(15);
    const dec = benefitStatus(uber, [{ usedOn: "2026-12-03", amount: 15 }], "2026-12-20");
    expect(dec).toMatchObject({ periodAmount: 35, used: 15, remaining: 20, unused: true });
    expect(annualAmount(uber)).toBe(15 * 11 + 35);
    expect(annualAmount({ period: "quarterly", amount: 50, amountByPeriod: { "4": 100 } })).toBe(250);
    expect(annualAmount({ period: "every_n_years", amount: 120, everyMonths: 48 })).toBe(30);
    expect(annualAmount({ period: "cardmember_year", amount: 300 })).toBe(300);
  });

  it("non-dollar units count uses; start/end dates bound the benefit", () => {
    const night = { period: "cardmember_year" as const, amount: 1, unit: "free_night" as const };
    expect(benefitStatus(night, [], "2026-11-23", "2025-03-01")).toMatchObject({ unused: true, remaining: 1 });
    expect(benefitStatus(night, [{ usedOn: "2026-04-01", amount: 0 }], "2026-11-23", "2025-03-01")).toMatchObject({ unused: false, used: 1 });
    const ending = { period: "monthly" as const, amount: 10, endsAt: "2027-02-17" };
    expect(benefitStatus(ending, [], "2027-02-16").unused).toBe(true);
    expect(benefitStatus(ending, [], "2027-02-17")).toMatchObject({ unused: false, inEffect: false });
    expect(benefitInEffect({ startsAt: "2026-12-01" }, "2026-11-30")).toBe(false);
  });

  it("every_n_years status uses startsAt (or the account anchor) as the cycle start", () => {
    const ge = { period: "every_n_years" as const, amount: 120, everyMonths: 48 };
    const inCycle = benefitStatus(ge, [{ usedOn: "2023-06-01", amount: 120 }], "2025-11-23", "2022-08-01");
    expect(inCycle.currentPeriod).toMatchObject({ start: "2022-08-01", end: "2026-08-01" });
    expect(inCycle.unused).toBe(false);
    // the 2022-08-01..2026-08-01 cycle has passed; the new cycle is unused
    const next = benefitStatus(ge, [{ usedOn: "2023-06-01", amount: 120 }], "2026-11-23", "2022-08-01");
    expect(next.currentPeriod).toMatchObject({ start: "2026-08-01", end: "2030-08-01" });
    expect(next.unused).toBe(true);
    // startsAt overrides the account anchor
    expect(benefitStatus({ ...ge, startsAt: "2024-01-01" }, [], "2026-11-23", "2022-08-01").currentPeriod).toMatchObject({ start: "2024-01-01" });
  });
});

describe("bonus progress", () => {
  it("computes ratio and days left", () => {
    const p = bonusProgress({ amountRequired: 4000, progress: 1000, deadline: "2026-12-03", status: "in_progress" }, "2026-11-23");
    expect(p.ratio).toBe(0.25);
    expect(p.remaining).toBe(3000);
    expect(p.daysLeft).toBe(10);
    expect(p.overdue).toBe(false);
  });
});
