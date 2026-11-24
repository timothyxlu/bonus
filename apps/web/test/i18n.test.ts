import { CATALOG_PRODUCTS, checkEligibility, type HistoryAccount } from "@bonus/core";
import { describe, expect, it } from "vitest";
import { ruleMessage, t } from "../src/i18n";
import { accountCreationMessageKey, giftSecretPayload, institutionMessageKey, institutionsForAccountKind } from "../src/lib/accountForm";
import type { Institution } from "../src/lib/types";

describe("i18n", () => {
  it("uses gift-card-specific creation and merchant labels", () => {
    expect(t(accountCreationMessageKey("gift_card"))).toBe("新增礼卡");
    expect(t(institutionMessageKey("gift_card"))).toBe("商户");
    expect(t(accountCreationMessageKey("credit_card"))).toBe("新增账户");
    expect(t(accountCreationMessageKey("bank_account"))).toBe("新增账户");
    expect(t(institutionMessageKey("credit_card"))).toBe("机构");
    expect(t(institutionMessageKey("bank_account"))).toBe("机构");
  });

  it("only offers merchants to gift cards without changing other account flows", () => {
    const institutions = [
      { id: "issuer", name: "Issuer", type: "issuer" },
      { id: "bank", name: "Bank", type: "bank" },
      { id: "merchant", name: "Merchant", type: "merchant" },
    ] as Institution[];
    expect(institutionsForAccountKind(institutions, "gift_card").map((institution) => institution.id)).toEqual(["merchant"]);
    expect(institutionsForAccountKind(institutions, "credit_card")).toEqual(institutions);
    expect(institutionsForAccountKind(institutions, "bank_account")).toEqual(institutions);
  });

  it("builds an optional gift-card secret without retaining blank fields", () => {
    expect(giftSecretPayload(" GIFT-1234 ", " 9876 ")).toEqual({ number: "GIFT-1234", pin: "9876" });
    expect(giftSecretPayload("", "")).toEqual({});
  });

  it("interpolates params", () => {
    expect(t("dash.nextDrop", { date: "2027-01-01" })).toBe("下次减少：2027-01-01");
  });

  it("has a Chinese message for every rule the engine emits", () => {
    const products = CATALOG_PRODUCTS.map((p) => ({ id: p.id, name: p.name, issuer: p.institutionId, family: p.family, ownerType: p.ownerType, kind: p.kind, rules: p.rules }));
    const mk = (productId: string, openedAt: string, extra: Partial<HistoryAccount> = {}): HistoryAccount => {
      const p = products.find((x) => x.id === productId)!;
      return { id: productId + openedAt, productId, issuer: p.issuer, family: p.family, kind: "credit_card", ownerType: p.ownerType, status: "open", openedAt, appliedAt: openedAt, isCharge: p.rules.isCharge, familyRank: p.rules.familyRank, ...extra };
    };
    const accounts = [
      ...["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01", "2026-06-01", "2026-07-01"].map((d) => mk("discover-it-cash-back", d)),
      mk("chase-sapphire-preferred", "2026-08-01", { bonusDates: ["2026-09-01"] }),
      mk("amex-platinum", "2026-11-20"),
      mk("citi-double-cash", "2026-11-18"),
      mk("boa-customized-cash", "2026-10-01"),
      mk("boa-travel-rewards", "2026-11-01"),
      mk("chase-freedom-flex", "2026-01-15"),
    ];
    const seen = new Set<string>();
    for (const p of products) {
      for (const r of checkEligibility(p.id, { products, accounts }, "2026-11-23").reasons) {
        seen.add(r.rule);
        expect(ruleMessage(r), r.rule).not.toBe(r.message);
      }
    }
    expect(seen.size).toBeGreaterThan(10);
  });
});
