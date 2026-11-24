import { describe, expect, it } from "vitest";
import { addDays, addMonths, daysBetween, isIsoDate, monthDrop, periodFor, benefitStatus, bonusProgress } from "../src";

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
    expect(periodFor("monthly", "2026-11-23")).toEqual({ start: "2026-11-01", end: "2026-12-01" });
    expect(periodFor("quarterly", "2026-11-23")).toEqual({ start: "2026-10-01", end: "2027-01-01" });
    expect(periodFor("semiannual", "2026-03-02")).toEqual({ start: "2026-01-01", end: "2026-07-01" });
    expect(periodFor("annual", "2026-03-02")).toEqual({ start: "2026-01-01", end: "2027-01-01" });
  });
  it("cardmember year resets on anniversary", () => {
    expect(periodFor("cardmember_year", "2026-11-23", "2024-05-10")).toEqual({ start: "2026-05-10", end: "2027-05-10" });
    expect(periodFor("cardmember_year", "2026-05-09", "2024-05-10")).toEqual({ start: "2025-05-10", end: "2026-05-10" });
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

describe("bonus progress", () => {
  it("computes ratio and days left", () => {
    const p = bonusProgress({ amountRequired: 4000, progress: 1000, deadline: "2026-12-03", status: "in_progress" }, "2026-11-23");
    expect(p.ratio).toBe(0.25);
    expect(p.remaining).toBe(3000);
    expect(p.daysLeft).toBe(10);
    expect(p.overdue).toBe(false);
  });
});
