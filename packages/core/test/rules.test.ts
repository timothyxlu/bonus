import { describe, expect, it } from "vitest";
import { checkEligibility, five24Status, x24Status } from "../src";
import { acct, other, products } from "./helpers";

const asOf = "2026-11-23";
const check = (productId: string, accounts: ReturnType<typeof acct>[]) =>
  checkEligibility(productId, { products, accounts }, asOf);
const rule = (r: ReturnType<typeof check>, id: string) => r.reasons.find((x) => x.rule === id);

describe("Chase 5/24", () => {
  it("counts personal cards from any issuer in the last 24 months", () => {
    const s = five24Status([other("2025-01-10"), other("2026-02-01"), other("2024-10-01"), other("2024-11-30")], asOf);
    // 2024-10-01 -> drops 2026-11-01 (conservative) so not counted; 2024-11-30 -> drops 2026-12-01
    expect(s.count).toBe(3);
    expect(s.nextDropDate).toBe("2026-12-01");
    expect(s.under).toBe(true);
  });

  it("excludes business cards unless they report to personal credit", () => {
    const s = five24Status(
      [acct("chase-ink-cash", "2026-01-01"), acct("amex-business-gold", "2026-01-01"), other("2026-01-01", { ownerType: "business", reportsToPersonal: true })],
      asOf,
    );
    expect(s.count).toBe(1);
  });

  it("excludes denied/pending applications and optionally AU cards", () => {
    const accts = [other("2026-01-01", { status: "denied" }), other("2026-01-02", { status: "pending" }), other("2026-01-03", { isAuthorizedUser: true }), other("2026-01-04", { status: "closed", closedAt: "2026-06-01" })];
    expect(five24Status(accts, asOf).count).toBe(2);
    expect(five24Status(accts, asOf, { countAuthorizedUsers: false }).count).toBe(1);
  });

  it("blocks at 5/24 and reports when the count drops to 4", () => {
    const accts = ["2025-01-15", "2025-03-01", "2025-06-01", "2025-09-01", "2026-01-01", "2026-05-01"].map((d) => other(d));
    const r = check("chase-sapphire-preferred", accts);
    expect(r.status).toBe("blocked");
    // 6 counted; need 2 to drop: 2025-01-15 -> 2027-02-01, 2025-03-01 -> 2027-04-01
    expect(rule(r, "chase_5_24")?.eligibleFrom).toBe("2027-04-01");
    expect(r.eligibleFrom).toBe("2027-04-01");
  });

  it("passes at 4/24 and applies to Chase business cards too", () => {
    const accts = ["2025-01-15", "2025-03-01", "2025-06-01", "2025-09-01"].map((d) => other(d));
    expect(rule(check("chase-ink-preferred", accts), "chase_5_24")?.outcome).toBe("pass");
    expect(check("chase-ink-preferred", [...accts, other("2026-02-02")]).status).toBe("blocked");
  });

  it("precise mode uses exact anniversaries", () => {
    const s = x24Status([other("2024-11-30")], "2026-11-29", 5, { conservative: false });
    expect(s.count).toBe(1);
    expect(s.counted[0]!.dropsOn).toBe("2026-11-30");
  });

  it("is uncertain when opened cards have no open date", () => {
    const r = check("chase-freedom-flex", [other("2026-01-01"), acct("citi-double-cash", null)]);
    expect(rule(r, "missing_open_dates")?.outcome).toBe("uncertain");
    expect(r.status).toBe("uncertain");
  });
});

describe("Chase Sapphire", () => {
  it("blocks while holding any Sapphire", () => {
    const r = check("chase-sapphire-reserve", [acct("chase-sapphire-preferred", "2020-01-01")]);
    expect(rule(r, "chase_sapphire_holding")?.outcome).toBe("block");
    expect(r.eligibleFrom).toBeUndefined();
  });
  it("blocks for 48 months after a Sapphire bonus", () => {
    const csp = acct("chase-sapphire-preferred", "2023-01-01", { status: "closed", closedAt: "2024-06-01", bonusDates: ["2023-03-15"] });
    const r = check("chase-sapphire-reserve", [csp]);
    expect(r.status).toBe("blocked");
    expect(r.eligibleFrom).toBe("2027-03-15");
  });
  it("is eligible after 48 months and once no Sapphire is held", () => {
    const csp = acct("chase-sapphire-preferred", "2020-01-01", { status: "closed", closedAt: "2022-06-01", bonusDates: ["2020-03-15"] });
    expect(check("chase-sapphire-reserve", [csp]).status).toBe("eligible");
  });
});

describe("Chase Sapphire approximation", () => {
  it("a closed Sapphire with no bonus record blocks ~48 months from its open date", () => {
    const csp = acct("chase-sapphire-preferred", "2024-02-10", { status: "closed", closedAt: "2025-03-01" });
    const r = check("chase-sapphire-reserve", [csp]);
    const s48 = rule(r, "chase_sapphire_48");
    expect(s48?.outcome).toBe("block");
    expect(s48?.eligibleFrom).toBe("2028-02-10");
    expect(s48?.params?.approx).toBe(1);
  });
  it("uses the original product of a product-changed account", () => {
    const pc = acct("chase-freedom-unlimited", "2024-02-10", { pastProducts: [{ productId: "chase-sapphire-preferred", family: "chase_sapphire" }] });
    expect(rule(check("chase-sapphire-reserve", [pc]), "chase_sapphire_48")?.eligibleFrom).toBe("2028-02-10");
    // ...and does not count against the Freedom Unlimited 24-month rule
    expect(rule(check("chase-freedom-unlimited", [{ ...pc, status: "closed", closedAt: "2025-01-01" }]), "bonus_cooldown")?.outcome).toBe("pass");
  });
});

describe("Amex", () => {
  it("once per lifetime per product", () => {
    const r = check("amex-gold", [acct("amex-gold", "2015-01-01", { status: "closed", closedAt: "2016-01-01" })]);
    expect(rule(r, "amex_lifetime")?.outcome).toBe("block");
    expect(r.eligibleFrom).toBeUndefined();
  });
  it("family ladder: Platinum blocks Gold and Green but Green does not block Gold", () => {
    const plat = [acct("amex-platinum", "2020-01-01")];
    expect(rule(check("amex-gold", plat), "amex_family")?.outcome).toBe("block");
    expect(rule(check("amex-green", plat), "amex_family")?.outcome).toBe("block");
    const green = [acct("amex-green", "2020-01-01")];
    expect(check("amex-gold", green).status).toBe("eligible");
    expect(rule(check("amex-delta-gold", [acct("amex-delta-reserve", "2021-01-01")]), "amex_family")?.outcome).toBe("block");
  });
  it("does not let a denied application count as having had the card", () => {
    expect(check("amex-gold", [acct("amex-gold", null, { status: "denied", appliedAt: "2026-01-01" })]).status).toBe("eligible");
  });
  it("blocks credit cards at the ~5 credit card limit, ignoring charge cards", () => {
    const accts = [
      acct("amex-blue-cash-everyday", "2019-01-01"),
      acct("amex-delta-gold", "2019-02-01"),
      acct("amex-hilton-surpass", "2019-03-01"),
      acct("amex-marriott-brilliant", "2019-04-01"),
      acct("amex-blue-business-plus", "2019-05-01"),
      acct("amex-platinum", "2019-06-01"),
    ];
    const r = check("amex-blue-cash-preferred", accts);
    expect(rule(r, "amex_credit_limit")?.outcome).toBe("block");
    expect(rule(r, "amex_credit_limit")?.params?.count).toBe(5);
    // charge cards are not subject to the limit
    expect(rule(check("amex-business-platinum", accts), "amex_credit_limit")).toBeUndefined();
    // closing one frees a slot
    accts[0] = { ...accts[0]!, status: "closed", closedAt: "2026-01-01" };
    expect(rule(check("amex-blue-cash-preferred", accts), "amex_credit_limit")?.outcome).toBe("info");
  });
  it("credit card velocity 1/5 and 2/90", () => {
    const r = check("amex-blue-cash-preferred", [acct("amex-delta-blue", "2026-11-20")]);
    expect(rule(r, "amex_1_5")?.eligibleFrom).toBe("2026-11-25");
    const r2 = check("amex-blue-cash-preferred", [acct("amex-delta-blue", "2026-09-01"), acct("amex-hilton-surpass", "2026-10-01")]);
    expect(rule(r2, "amex_2_90")?.eligibleFrom).toBe("2026-11-30");
  });
});

describe("Citi", () => {
  it("48 months per product from the last bonus", () => {
    const r = check("citi-strata-premier", [acct("citi-strata-premier", "2023-05-01", { status: "closed", closedAt: "2024-06-01", bonusDates: ["2023-07-01"] })]);
    expect(rule(r, "citi_48")?.outcome).toBe("block");
    expect(r.eligibleFrom).toBe("2027-07-01");
    // a different product is fine
    expect(rule(check("citi-custom-cash", [acct("citi-strata-premier", "2023-05-01", { bonusDates: ["2023-07-01"] })]), "citi_48")?.outcome).toBe("pass");
  });
  it("family scope when configured", () => {
    const fam = products.map((p) => (p.id === "citi-custom-cash" ? { ...p, rules: { bonusCooldownMonths: 48, cooldownScope: "family" as const } } : p));
    const r = checkEligibility("citi-custom-cash", { products: fam, accounts: [acct("citi-strata-premier", "2023-05-01", { bonusDates: ["2023-07-01"] })] }, asOf);
    expect(r.reasons.find((x) => x.rule === "citi_48")?.outcome).toBe("block");
  });
  it("no bonus record: the open date is an approximate bonus date (and says so)", () => {
    const r = check("citi-double-cash", [acct("citi-double-cash", "2024-01-01", { status: "closed", closedAt: "2025-01-01" })]);
    const c = rule(r, "citi_48");
    expect(c?.outcome).toBe("block");
    expect(c?.eligibleFrom).toBe("2028-01-01");
    expect(c?.params?.approx).toBe(1);
    expect(c?.message).toMatch(/approximate/);
    // a recorded bonus wins over the approximation
    const real = check("citi-double-cash", [acct("citi-double-cash", "2024-01-01", { status: "closed", closedAt: "2025-01-01", bonusDates: ["2024-04-01"] })]);
    expect(rule(real, "citi_48")?.eligibleFrom).toBe("2028-04-01");
    expect(rule(real, "citi_48")?.params?.approx).toBe(0);
  });
  it("no approximation when the bonus explicitly did not pay out", () => {
    const r = check("citi-double-cash", [acct("citi-double-cash", "2024-01-01", { status: "closed", closedAt: "2025-01-01", noBonus: true })]);
    expect(rule(r, "citi_48")?.outcome).toBe("pass");
  });
  it("approximation outside the window passes", () => {
    expect(rule(check("citi-double-cash", [acct("citi-double-cash", "2020-01-01", { status: "closed", closedAt: "2021-01-01" })]), "citi_48")?.outcome).toBe("pass");
  });
  it("1/8 and 2/65, counting denied applications", () => {
    const r = check("citi-custom-cash", [acct("citi-strata-premier", null, { status: "denied", appliedAt: "2026-11-18" })]);
    expect(rule(r, "citi_1_8")?.eligibleFrom).toBe("2026-11-26");
    const r2 = check("citi-custom-cash", [acct("citi-strata-premier", "2026-10-01"), acct("citi-double-cash", "2026-11-01")]);
    expect(rule(r2, "citi_1_8")?.outcome).toBe("pass");
    expect(rule(r2, "citi_2_65")?.eligibleFrom).toBe("2026-12-05");
    expect(r2.status).toBe("blocked");
  });
});

describe("Bank of America 2/3/4", () => {
  it("blocks at 2 in 2 months", () => {
    const r = check("boa-premium-rewards", [acct("boa-customized-cash", "2026-10-01"), acct("boa-travel-rewards", "2026-11-01")]);
    expect(r.reasons.filter((x) => x.rule === "boa_2_3_4")[0]?.eligibleFrom).toBe("2026-12-01");
  });
  it("blocks at 3 in 12 months and 4 in 24 months", () => {
    const three = [acct("boa-customized-cash", "2026-01-01"), acct("boa-travel-rewards", "2026-04-01"), acct("boa-premium-rewards", "2026-07-01", { productId: "x" })];
    const r = check("boa-premium-rewards", three);
    expect(r.reasons.find((x) => x.rule === "boa_2_3_4" && x.params?.months === 12)?.eligibleFrom).toBe("2027-01-01");
    const four = [acct("boa-customized-cash", "2025-01-01"), acct("boa-travel-rewards", "2025-04-01"), acct("boa-customized-cash", "2025-07-01", { productId: "y" }), acct("boa-travel-rewards", "2025-12-01", { productId: "z" })];
    const r4 = check("boa-premium-rewards", four);
    expect(r4.reasons.find((x) => x.rule === "boa_2_3_4" && x.params?.months === 24)?.eligibleFrom).toBe("2027-01-01");
  });
  it("passes when under all windows", () => {
    expect(check("boa-premium-rewards", [acct("boa-customized-cash", "2025-01-01")]).status).toBe("eligible");
  });
});

describe("Barclays 6/24", () => {
  it("passes under 6, borderline at 6, blocks above", () => {
    const dates = ["2025-01-01", "2025-02-01", "2025-03-01", "2025-04-01", "2025-05-01", "2025-06-01", "2025-07-01"];
    expect(check("barclays-aviator-red", dates.slice(0, 5).map((d) => other(d))).status).toBe("eligible");
    expect(check("barclays-aviator-red", dates.slice(0, 6).map((d) => other(d))).status).toBe("uncertain");
    const r = check("barclays-aviator-red", dates.map((d) => other(d)));
    expect(r.status).toBe("blocked");
    expect(r.eligibleFrom).toBe("2027-02-01");
  });
});

describe("engine", () => {
  it("current holders are blocked", () => {
    expect(rule(check("chase-freedom-flex", [acct("chase-freedom-flex", "2020-01-01")]), "current_holder")?.outcome).toBe("block");
  });
  it("eligibleFrom is the latest of all dated blocks", () => {
    const accts = [
      ...["2025-01-15", "2025-03-01", "2025-06-01", "2025-09-01", "2026-01-01"].map((d) => other(d)),
      acct("chase-sapphire-preferred", "2022-01-01", { status: "closed", closedAt: "2023-01-01", bonusDates: ["2024-01-01"] }),
    ];
    const r = check("chase-sapphire-reserve", accts);
    expect(r.status).toBe("blocked");
    expect(r.eligibleFrom).toBe("2028-01-01");
  });
  it("is uncertain for issuers without modelled rules", () => {
    expect(check("capital-one-venture-x", []).status).toBe("uncertain");
  });
  it("throws for unknown products", () => {
    expect(() => check("nope", [])).toThrow();
  });
});

describe("product changes", () => {
  it("a Sapphire bonus still counts after product-changing to Freedom", () => {
    const pc = acct("chase-freedom-unlimited", "2023-01-01", {
      bonuses: [{ date: "2023-04-01", productId: "chase-sapphire-preferred", family: "chase_sapphire" }],
      pastProducts: [{ productId: "chase-sapphire-preferred", family: "chase_sapphire" }],
    });
    const r = check("chase-sapphire-reserve", [pc]);
    expect(r.reasons.find((x) => x.rule === "chase_sapphire_holding")).toBeUndefined();
    expect(r.eligibleFrom).toBe("2027-04-01");
  });
  it("Amex lifetime/family considers past products", () => {
    const pc = acct("amex-green", "2019-01-01", { pastProducts: [{ productId: "amex-platinum", family: "amex_mr_charge", familyRank: 3 }] });
    expect(check("amex-platinum", [pc]).reasons.find((x) => x.rule === "amex_lifetime")?.outcome).toBe("block");
    expect(check("amex-gold", [pc]).reasons.find((x) => x.rule === "amex_family")?.outcome).toBe("block");
  });
});

describe("catalog", () => {
  it("has unique ids that reference known institutions, and includes the newly added products", async () => {
    const { CATALOG_PRODUCTS, CATALOG_INSTITUTIONS } = await import("../src");
    const ids = CATALOG_PRODUCTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    const inst = new Set(CATALOG_INSTITUTIONS.map((i) => i.id));
    for (const p of CATALOG_PRODUCTS) expect(inst.has(p.institutionId), p.id).toBe(true);
    for (const id of ["amex-hilton-aspire", "amex-everyday-preferred", "chase-united-quest", "citi-aa-mileup", "citi-rewards-plus", "barclays-hawaiian", "us-bank-altitude-reserve", "wells-fargo-bilt", "boa-unlimited-cash"])
      expect(ids).toContain(id);
    expect(inst.has("synchrony") && inst.has("penfed")).toBe(true);
  });
});
