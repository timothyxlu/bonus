import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const BASE = "http://localhost/api";
const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
  const res = await (exports as any).default.fetch(
    new Request(`${BASE}${path}`, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json", ...headers } : headers,
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};

describe("REST API", () => {
  it("health is public", async () => {
    expect((await call("GET", "/health")).body).toEqual({ ok: true });
  });

  it("rejects non-local requests without a Cloudflare Access token", async () => {
    const res = await (exports as any).default.fetch(new Request("https://bonus.example.com/api/accounts"));
    expect(res.status).toBe(401);
  });

  it("rejects a forged Access token", async () => {
    const res = await (exports as any).default.fetch(
      new Request("https://bonus.example.com/api/accounts", { headers: { "Cf-Access-Jwt-Assertion": "a.b.c" } }),
    );
    expect(res.status).toBe(401);
  });

  it("seeds the catalog on first use", async () => {
    const r = await call("GET", "/products");
    expect(r.status).toBe(200);
    expect(r.body.some((p: any) => p.id === "chase-sapphire-reserve")).toBe(true);
  });

  it("refuses full card numbers", async () => {
    const r = await call("POST", "/accounts", { productId: "amex-gold", last4: "4111111111111111" });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/last4/);
  });

  it("CRUD: account, events, bonus, benefit; dashboard and eligibility reflect it", async () => {
    const created = await call("POST", "/accounts", { productId: "chase-sapphire-preferred", last4: "0001", appliedAt: "2025-05-28", openedAt: "2025-06-01" });
    expect(created.status).toBe(201);
    const id = created.body.id;
    expect(created.body.events.map((e: any) => e.type).sort()).toEqual(["applied", "approved"]);
    expect(created.body.ownerType).toBe("personal");

    const bonus = await call("POST", `/accounts/${id}/bonuses`, { amountRequired: 5000, progress: 1000, deadline: "2099-01-01", rewardAmount: 75000 });
    expect(bonus.status).toBe(201);
    const ben = await call("POST", `/accounts/${id}/benefits`, { name: "DoorDash", amount: 10, period: "monthly" });
    expect(ben.status).toBe(201);

    let detail = await call("GET", `/accounts/${id}`);
    expect(detail.body.unusedBenefits).toBe(1);
    expect(detail.body.activeBonus.ratio).toBeCloseTo(0.2);

    const today = new Date().toISOString().slice(0, 10);
    expect((await call("POST", `/benefits/${ben.body.id}/uses`, { usedOn: today })).status).toBe(201);
    detail = await call("GET", `/accounts/${id}`);
    expect(detail.body.unusedBenefits).toBe(0);
    expect(detail.body.benefits[0].used).toBe(10);

    // Holding a Sapphire blocks another Sapphire.
    const elig = await call("GET", "/eligibility/chase-sapphire-reserve");
    expect(elig.body.status).toBe("blocked");
    expect(elig.body.reasons.some((r: any) => r.rule === "chase_sapphire_holding")).toBe(true);

    const dash = await call("GET", "/dashboard");
    expect(dash.status).toBe(200);
    expect(dash.body.five24.count).toBeGreaterThanOrEqual(1);
    expect(dash.body.deadlines.length).toBeGreaterThanOrEqual(1);

    // bonus_earned posts the bonus; product change moves it out of the Sapphire family.
    expect((await call("POST", `/accounts/${id}/events`, { type: "bonus_earned", date: "2025-08-10" })).status).toBe(201);
    expect((await call("POST", `/accounts/${id}/events`, { type: "product_change", date: "2026-07-01", toProductId: "chase-freedom-unlimited" })).status).toBe(201);
    detail = await call("GET", `/accounts/${id}`);
    expect(detail.body.productId).toBe("chase-freedom-unlimited");
    expect(detail.body.bonuses[0].status).toBe("posted");

    const after = await call("GET", "/eligibility/chase-sapphire-reserve");
    expect(after.body.reasons.some((r: any) => r.rule === "chase_sapphire_holding")).toBe(false);
    expect(after.body.reasons.find((r: any) => r.rule === "chase_sapphire_48")?.eligibleFrom).toBe("2029-08-10");

    expect((await call("POST", `/accounts/${id}/events`, { type: "closed", date: "2026-10-01" })).status).toBe(201);
    expect((await call("GET", `/accounts/${id}`)).body.status).toBe("closed");

    expect((await call("DELETE", `/accounts/${id}`)).status).toBe(200);
    expect((await call("GET", `/accounts/${id}`)).status).toBe(404);
  });

  it("imports JSON (with dry run and duplicate detection) and CSV", async () => {
    const payload = {
      version: 1,
      accounts: [
        { product: "Citi Strata Premier", last4: "0004", openedAt: "2025-02-10", bonuses: [{ status: "posted", earnedAt: "2025-04-02" }] },
        { product: "Unknown Credit Union Card", issuer: "Example CU", openedAt: "2024-01-01" },
        { product: "nope" },
      ],
    };
    const dry = await call("POST", "/import?dryRun=1", payload);
    expect(dry.body).toMatchObject({ dryRun: true, created: 2 });
    expect(dry.body.errors).toHaveLength(1);
    const real = await call("POST", "/import", payload);
    expect(real.body.created).toBe(2);
    const again = await call("POST", "/import", payload);
    expect(again.body.created).toBe(0);
    expect(again.body.skipped).toHaveLength(2);

    const elig = await call("GET", "/eligibility/citi-strata-premier");
    expect(elig.body.status).toBe("blocked");

    const csv = await call("POST", "/import", "product,last4,opened_at,bonus_earned_at\n\"Amex Gold\",0002,2026-09-20,\namex-platinum,0009,2026-11-10,\n", { "Content-Type": "text/csv" });
    expect(csv.body.created).toBe(1); // "Amex Gold" name does not match "American Express Gold"
    expect(csv.body.errors).toHaveLength(1);
  });

  it("treats bank accounts and gift cards as first-class bonus sources", async () => {
    const inst = await call("POST", "/institutions", { name: "Example Credit Union", type: "bank" });
    expect(inst.status).toBe(201);
    const bank = await call("POST", "/accounts", {
      kind: "bank_account",
      institutionId: inst.body.id,
      nickname: "Checking",
      openedAt: "2026-10-01",
      details: { accountType: "checking" },
    });
    expect(bank.status).toBe(201);
    const invalidGift = await call("POST", "/accounts", {
      kind: "gift_card",
      institutionId: inst.body.id,
      nickname: "Not a merchant",
    });
    expect(invalidGift.status).toBe(400);
    expect(invalidGift.body.error).toMatch(/merchant institution/);
    const invalidGiftProduct = await call("POST", "/products", {
      institutionId: inst.body.id,
      name: "Invalid gift product",
      kind: "gift_card",
    });
    expect(invalidGiftProduct.status).toBe(201);
    expect((await call("POST", "/accounts", { kind: "gift_card", productId: invalidGiftProduct.body.id })).status).toBe(400);
    const year = new Date().toISOString().slice(0, 4);
    await call("POST", `/accounts/${bank.body.id}/bonuses`, { requirementType: "direct_deposit", amountRequired: 500, deadline: "2099-01-01", rewardAmount: 300, rewardUnit: "USD" });
    await call("POST", `/accounts/${bank.body.id}/bonuses`, { requirementType: "balance", rewardAmount: 200, rewardUnit: "USD", status: "posted", earnedAt: `${year}-01-15` });

    const gift = await call("POST", "/institutions", { name: "Example Grocer", type: "merchant" });
    const gc = await call("POST", "/accounts", { kind: "gift_card", institutionId: gift.body.id, nickname: "Grocer $100", details: { faceValue: 100, purchasePrice: 85 } });
    expect(gc.status).toBe(201);
    expect((await call("PATCH", `/accounts/${gc.body.id}`, { institutionId: inst.body.id })).status).toBe(400);

    const dash = await call("GET", "/dashboard");
    expect(dash.body.byKind.bank_account).toMatchObject({ open: 1, activeBonuses: 1, postedThisYear: 1 });
    expect(dash.body.byKind.gift_card).toMatchObject({ open: 1, faceValue: 100, saved: 15 });
    expect(dash.body.byKind.gift_card.avgDiscount).toBeCloseTo(0.15);
    expect(dash.body.rewards.earnedThisYear.USD).toBeGreaterThanOrEqual(200);
    expect(dash.body.rewards.pending.USD).toBeGreaterThanOrEqual(300);
    expect(dash.body.deadlines.some((d: any) => d.kind === "bank_account" && d.institutionName === "Example Credit Union")).toBe(true);

    const bankOnly = await call("GET", "/bonuses?kind=bank_account");
    expect(bankOnly.body).toHaveLength(2);
    expect(bankOnly.body[0].active).toBe(true); // active first
    expect((await call("GET", "/bonuses?status=posted&kind=bank_account")).body).toHaveLength(1);
    expect((await call("GET", "/bonuses?status=bogus")).status).toBe(400);
  });

  it("keeps data per owner", async () => {
    const res = await (exports as any).default.fetch(new Request(`${BASE}/accounts`));
    const mine = (await res.json()) as any[];
    expect(mine.every((a) => a.ownerId === "tester@example.com")).toBe(true);
  });

  it("CRUDs owner-scoped loyalty balances without merging duplicate program names", async () => {
    const first = await call("POST", "/loyalty-balances", { category: "flight", program: "Alaska", balance: 97148 });
    const second = await call("POST", "/loyalty-balances", { category: "flight", program: "Alaska", balance: 83139 });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.id).not.toBe(second.body.id);

    const list = await call("GET", "/loyalty-balances?category=flight");
    expect(list.body.filter((row: any) => row.program === "Alaska").map((row: any) => row.balance)).toEqual([97148, 83139]);
    expect((await call("GET", "/loyalty-balances?category=bogus")).status).toBe(400);
    expect((await call("POST", "/loyalty-balances", { category: "hotel", program: "Hyatt", balance: -1 })).status).toBe(400);
    expect((await call("POST", "/loyalty-balances", { category: "hotel", program: "Hyatt", balance: 1.5 })).status).toBe(400);

    const updated = await call("PATCH", `/loyalty-balances/${first.body.id}`, { balance: 100000, notes: "primary" });
    expect(updated.body).toMatchObject({ program: "Alaska", balance: 100000, notes: "primary" });
    expect((await call("DELETE", `/loyalty-balances/${second.body.id}`)).body.deleted).toBe(second.body.id);
    expect((await call("PATCH", `/loyalty-balances/${second.body.id}`, { balance: 1 })).status).toBe(404);
  });

  it("imports loyalty balances idempotently and preserves same-program accounts", async () => {
    const payload = { version: 1, loyaltyBalances: [
      { category: "flight", program: "Alaska import", balance: 97148 },
      { category: "flight", program: "Alaska import", balance: 83139 },
      { category: "credit_card", program: "Amex import", balance: 499000 },
    ] };
    expect((await call("POST", "/import?dryRun=1", payload)).body.loyaltyBalancesCreated).toBe(3);
    expect((await call("POST", "/import", payload)).body.loyaltyBalancesCreated).toBe(3);
    const again = await call("POST", "/import", payload);
    expect(again.body.loyaltyBalancesCreated).toBe(0);
    expect(again.body.skipped).toHaveLength(3);
    expect((await call("GET", "/loyalty-balances")).body.filter((row: any) => row.program === "Alaska import")).toHaveLength(2);
  });
});
