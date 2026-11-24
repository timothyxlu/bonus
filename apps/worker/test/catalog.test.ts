import { CATALOG_VERSION } from "@bonus/core";
import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { _resetCatalogCache } from "../src/services/catalog";

const DB = (env as unknown as { DB: D1Database }).DB;

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
const product = async (id: string, archived = false) =>
  (await call("GET", `/products${archived ? "?archived=1" : ""}`)).body.find((p: any) => p.id === id);

describe("editable catalog", () => {
  it("seeds the added generic products and institutions", async () => {
    const products = (await call("GET", "/products")).body;
    for (const id of ["amex-hilton-aspire", "chase-united-quest", "citi-aa-business", "us-bank-altitude-go", "wells-fargo-bilt", "boa-unlimited-cash"])
      expect(products.some((p: any) => p.id === id), id).toBe(true);
    const insts = (await call("GET", "/institutions")).body.map((i: any) => i.id);
    expect(insts).toContain("synchrony");
    expect(insts).toContain("penfed");
  });

  it("institutions: create, edit in place, override a seeded one, reset", async () => {
    const c = await call("POST", "/institutions", { name: "Example FCU", type: "bank" });
    expect(c.body).toMatchObject({ id: "example_fcu", isCatalog: false });
    expect((await call("POST", "/institutions", { id: "example_fcu", name: "dup" })).status).toBe(400);
    expect((await call("PATCH", "/institutions/example_fcu", { name: "Example Federal CU" })).body.name).toBe("Example Federal CU");
    const o = await call("PATCH", "/institutions/synchrony", { name: "Synchrony Bank" });
    expect(o.body).toMatchObject({ name: "Synchrony Bank", isCatalog: true, customized: true });
    expect((await call("DELETE", "/institutions/synchrony/override")).body.name).toBe("Synchrony");
    expect((await call("PATCH", "/institutions/nope", { name: "x" })).status).toBe(400);
  });

  it("products: create with rules, edit in place, validation", async () => {
    const r = await call("POST", "/products", {
      institutionId: "synchrony",
      name: "Example Store Card",
      annualFee: 0,
      family: "example_store",
      rules: { bonusCooldownMonths: 24, cooldownScope: "family" },
    });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ id: "synchrony-example-store-card", isCatalog: false, institutionName: "Synchrony" });
    const u = await call("PATCH", `/products/${r.body.id}`, { annualFee: 49, rules: { bonusCooldownMonths: null, lifetimeBonus: true } });
    expect(u.body.annualFee).toBe(49);
    expect(u.body.rules).toEqual({ cooldownScope: "family", lifetimeBonus: true });
    expect((await call("POST", "/products", { institutionId: "nope", name: "x" })).status).toBe(400);
    expect((await call("PATCH", `/products/${r.body.id}`, { rules: { bogus: 1 } })).status).toBe(400);
  });

  it("editing a seeded product creates an override that resyncs never clobber", async () => {
    const e = await call("PATCH", "/products/amex-gold", { name: "Amex Gold (my name)", annualFee: 325, rules: { familyRank: 2 } });
    expect(e.body).toMatchObject({ name: "Amex Gold (my name)", isCatalog: true, customized: true });
    // Accounts show the overridden name.
    const a = await call("POST", "/accounts", { productId: "amex-gold", openedAt: "2024-01-10" });
    expect(a.body.productName).toBe("Amex Gold (my name)");
    // Force a re-sync of the shipped catalog: override survives.
    await DB.prepare("UPDATE app_meta SET value = '0' WHERE key = 'catalog_version'").run();
    _resetCatalogCache();
    expect((await product("amex-gold")).name).toBe("Amex Gold (my name)");
    const meta = await DB.prepare("SELECT value FROM app_meta WHERE key = 'catalog_version'").first<{ value: string }>();
    expect(meta?.value).toBe(String(CATALOG_VERSION));
    // The shared seed row itself is untouched.
    const raw = await DB.prepare("SELECT name FROM products WHERE id = 'amex-gold'").first<{ name: string }>();
    expect(raw?.name).toBe("American Express Gold");
    // Reset back to defaults.
    expect((await call("DELETE", "/products/amex-gold/override")).body.name).toBe("American Express Gold");
  });

  it("archive hides a product from pickers but keeps accounts working", async () => {
    const a = await call("POST", "/accounts", { productId: "citi-rewards-plus", openedAt: "2025-02-01" });
    expect((await call("POST", "/products/citi-rewards-plus/archive", { archived: true })).body.archived).toBe(true);
    expect(await product("citi-rewards-plus")).toBeUndefined();
    expect((await product("citi-rewards-plus", true)).archived).toBe(true);
    expect((await call("GET", `/accounts/${a.body.id}`)).body.productName).toBe("Citi Rewards+");
    expect((await call("POST", "/accounts", { productId: "citi-rewards-plus" })).status).toBe(400);
    expect((await call("GET", "/eligibility/citi-rewards-plus")).status).toBe(200); // history still resolves it
    await call("POST", "/products/citi-rewards-plus/archive", { archived: false });
    expect(await product("citi-rewards-plus")).toBeDefined();
    // kind cannot change while accounts use it
    expect((await call("PATCH", "/products/citi-rewards-plus", { kind: "bank_account" })).status).toBe(400);
  });

  it("product_change to a newly created product, and account editing", async () => {
    const a = await call("POST", "/accounts", { productId: "chase-sapphire-preferred", openedAt: "2024-03-01" });
    const p = await call("POST", "/products", { institutionId: "chase", name: "Example No-Fee Card", family: "chase_example" });
    const ev = await call("POST", `/accounts/${a.body.id}/events`, { type: "product_change", date: "2025-06-01", toProductId: p.body.id });
    expect(ev.status).toBe(201);
    expect(ev.body.fromProductId).toBe("chase-sapphire-preferred");
    expect((await call("GET", `/accounts/${a.body.id}`)).body.productId).toBe(p.body.id);
    // Sapphire history kept: approximate bonus date = open date of the original Sapphire
    const elig = (await call("GET", "/eligibility/chase-sapphire-reserve")).body;
    const s48 = elig.reasons.find((r: any) => r.rule === "chase_sapphire_48");
    expect(s48).toMatchObject({ outcome: "block", eligibleFrom: "2028-03-01" });
    expect(s48.params.approx).toBe(1);
    // product_change across kinds is refused
    const bankProd = await call("POST", "/products", { institutionId: "chase", name: "Example Checking", kind: "bank_account" });
    expect((await call("POST", `/accounts/${a.body.id}/events`, { type: "product_change", date: "2025-07-01", toProductId: bankProd.body.id })).status).toBe(400);

    // account edits
    const u = await call("PATCH", `/accounts/${a.body.id}`, { nickname: "Daily", last4: "4321", notes: "x", isAuthorizedUser: false, closedAt: "2026-01-01", status: "closed" });
    expect(u.body).toMatchObject({ nickname: "Daily", last4: "4321", status: "closed", closedAt: "2026-01-01" });
    expect((await call("PATCH", `/accounts/${a.body.id}`, { last4: "123456" })).status).toBe(400);
    expect((await call("PATCH", `/accounts/${a.body.id}`, { productId: bankProd.body.id })).status).toBe(400);
  });

  it("trailing digits: 4 or 5 accepted (Amex shows 5), anything else refused, also at the DB level", async () => {
    const a = await call("POST", "/accounts", { productId: "amex-platinum", last4: "12345" });
    expect(a.status).toBe(201);
    expect(a.body.last4).toBe("12345");
    expect(a.body.label).toContain("12345");
    expect((await call("PATCH", `/accounts/${a.body.id}`, { last4: "1234" })).body.last4).toBe("1234");
    expect((await call("PATCH", `/accounts/${a.body.id}`, { last4: "123456" })).status).toBe(400);
    expect((await call("POST", "/accounts", { productId: "amex-platinum", last4: "378282246310005" })).status).toBe(400);
    await expect(DB.prepare("UPDATE accounts SET last_digits = '123456' WHERE id = ?").bind(a.body.id).run()).rejects.toThrow(/CHECK/);
    await expect(DB.prepare("UPDATE accounts SET last4 = '12345' WHERE id = ?").bind(a.body.id).run()).rejects.toThrow(/CHECK/);
  });

  it("migration 0003 copies legacy last4 values", async () => {
    await DB.prepare("INSERT INTO accounts (id, owner_id, kind, last4) VALUES ('legacy-1', 'someone@example.com', 'credit_card', '0042')").run();
    await DB.prepare("UPDATE accounts SET last_digits = last4 WHERE last4 IS NOT NULL AND last_digits IS NULL").run();
    const row = await DB.prepare("SELECT last_digits FROM accounts WHERE id = 'legacy-1'").first<{ last_digits: string }>();
    expect(row?.last_digits).toBe("0042");
  });

  it("cooldown approximation is skipped when the bonus explicitly failed", async () => {
    const a = await call("POST", "/accounts", { productId: "citi-aa-mileup", openedAt: "2025-05-01" });
    expect((await call("GET", "/eligibility/citi-aa-mileup")).body.reasons.find((r: any) => r.rule === "citi_48").params.approx).toBe(1);
    await call("POST", `/accounts/${a.body.id}/bonuses`, { rewardAmount: 10000, status: "failed" });
    await call("PATCH", `/accounts/${a.body.id}`, { status: "closed", closedAt: "2026-01-01" });
    expect((await call("GET", "/eligibility/citi-aa-mileup")).body.reasons.find((r: any) => r.rule === "citi_48").outcome).toBe("pass");
  });
});
