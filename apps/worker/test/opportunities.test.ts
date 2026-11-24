import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const call = async (method: string, path: string, body?: unknown) => {
  const res = await (exports as any).default.fetch(
    new Request(`http://localhost/api${path}`, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : {},
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};

describe("opportunities (机会)", () => {
  it("values, checks and ranks offers across kinds, and claims one", async () => {
    // History: holding a Sapphire, and a bank bonus from Chase last year.
    await call("POST", "/accounts", { productId: "chase-sapphire-preferred", openedAt: "2025-06-01" });
    const bank = await call("POST", "/accounts", { kind: "bank_account", institutionId: "chase", nickname: "Old checking", openedAt: "2025-09-01", status: "closed", closedAt: "2026-03-01" });
    await call("POST", `/accounts/${bank.body.id}/bonuses`, { rewardAmount: 300, rewardUnit: "USD", status: "posted", earnedAt: "2025-11-01" });

    const csr = await call("POST", "/offers", { kind: "credit_card", productId: "chase-sapphire-reserve", title: "CSR 125k", rewardAmount: 125000, rewardUnit: "points", amountRequired: 6000, windowMonths: 3 });
    expect(csr.status).toBe(201);
    expect(csr.body.institutionId).toBe("chase");
    await call("POST", "/offers", { kind: "credit_card", productId: "amex-gold", title: "Gold 100k", rewardAmount: 100000, rewardUnit: "points", amountRequired: 6000, windowMonths: 6 });
    await call("POST", "/offers", { kind: "bank_account", institutionId: "chase", title: "Chase checking $400", rewardAmount: 400, rewardUnit: "USD", requirementType: "direct_deposit", amountRequired: 1000, windowMonths: 3, cooldownMonths: 24 });
    const gift = await call("POST", "/institutions", { name: "Opp Grocer", type: "merchant" });
    await call("POST", "/offers", { kind: "gift_card", institutionId: gift.body.id, title: "Grocer 15% off", rewardAmount: 15, rewardUnit: "USD", amountRequired: 100, expiresAt: "2099-01-01" });
    expect((await call("POST", "/offers", { kind: "gift_card", title: "no institution", rewardAmount: 1 })).status).toBe(400);

    const opp = await call("GET", "/opportunities");
    expect(opp.status).toBe(200);
    const byTitle = Object.fromEntries(opp.body.map((o: any) => [o.title, o]));
    // Gold: 100k MR * 1.5c = $1500 - $325 fee
    expect(byTitle["Gold 100k"].value.netUsd).toBe(1175);
    expect(byTitle["Gold 100k"].eligibility.status).toBe("eligible");
    expect(byTitle["CSR 125k"].eligibility.status).toBe("blocked"); // holding a Sapphire
    expect(byTitle["Chase checking $400"].eligibility.status).toBe("blocked");
    expect(byTitle["Chase checking $400"].eligibility.eligibleFrom).toBe("2027-11-01");
    expect(byTitle["Grocer 15% off"].value.returnOnRequired).toBeCloseTo(0.15);
    // Eligible first by net value; blocked last.
    const statuses = opp.body.map((o: any) => o.eligibility.status);
    expect(statuses.indexOf("blocked")).toBeGreaterThan(statuses.lastIndexOf("eligible"));
    expect(opp.body[0].title).toBe("Gold 100k");

    expect((await call("GET", "/opportunities?kind=gift_card")).body).toHaveLength(1);

    // Claim: creates the account and a bonus target with a deadline.
    const claim = await call("POST", `/offers/${byTitle["Gold 100k"].id}/claim`, { openedAt: "2026-11-20", last4: "0002" });
    expect(claim.status).toBe(201);
    const acct = await call("GET", `/accounts/${claim.body.accountId}`);
    expect(acct.body.productId).toBe("amex-gold");
    expect(acct.body.bonuses[0]).toMatchObject({ amountRequired: 6000, rewardAmount: 100000, deadline: "2027-05-20", status: "in_progress" });
    // Now holding Gold -> the Gold offer is blocked (lifetime rule).
    const after = await call("GET", "/opportunities?kind=credit_card");
    expect(after.body.find((o: any) => o.title === "Gold 100k").eligibility.status).toBe("blocked");

    // Archive hides it.
    await call("PATCH", `/offers/${byTitle["Grocer 15% off"].id}`, { status: "archived" });
    expect((await call("GET", "/opportunities?kind=gift_card")).body).toHaveLength(0);
    expect((await call("GET", "/opportunities?kind=gift_card&archived=1")).body).toHaveLength(1);
  });

  it("imports offers alongside accounts", async () => {
    const r = await call("POST", "/import", {
      version: 1,
      offers: [
        { kind: "credit_card", product: "citi-strata-premier", title: "Strata Premier 75k", rewardAmount: 75000, rewardUnit: "points", amountRequired: 4000, windowMonths: 3 },
        { kind: "bank_account", issuer: "Imported Bank", title: "Imported Bank $250", rewardAmount: 250, rewardUnit: "USD", requirementType: "direct_deposit" },
        { kind: "gift_card", title: "broken", rewardAmount: 1 },
      ],
    });
    expect(r.body.offersCreated).toBe(2);
    expect(r.body.errors).toHaveLength(1);
    const again = await call("POST", "/import", { version: 1, offers: [{ kind: "credit_card", product: "citi-strata-premier", title: "Strata Premier 75k", rewardAmount: 75000 }] });
    expect(again.body.offersCreated).toBe(0);
  });
});
