import { createMcpHandler } from "agents/mcp/server";
import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createMcpServer } from "../src/mcp/server";

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

const today = new Date().toISOString().slice(0, 10);
const thisMonth = Number(today.slice(5, 7));

async function mcp(email: string, name: string, args: Record<string, unknown>) {
  const props = { email };
  const handler = createMcpHandler(() => createMcpServer(env as any, props), { authContext: { props } });
  const res = await handler(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers: { Host: "localhost", "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-06-18" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
    }),
    env,
    { waitUntil() {}, passThroughOnException() {} } as any,
  );
  const text = await res.text();
  const json = JSON.parse(text.startsWith("{") ? text : text.split("\n").find((l) => l.startsWith("data:"))!.slice(5));
  const content = json.result?.content?.[0]?.text;
  return { isError: !!json.result?.isError, data: content && !json.result?.isError ? JSON.parse(content) : content };
}

describe("benefits: shapes, validation, status", () => {
  let acct = "";

  it("uneven monthly schedule (Uber-style) with derived yearly total", async () => {
    acct = (await call("POST", "/accounts", { productId: "amex-platinum", openedAt: "2024-02-29" })).body.id;
    const r = await call("POST", `/accounts/${acct}/benefits`, {
      name: "Uber Cash",
      amount: 15,
      period: "monthly",
      amountByPeriod: { "12": 35 },
      enrollmentRequired: true,
      limitations: "Uber rides or Uber Eats in the US",
      sourceUrl: "https://example.com/benefit",
    });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ annualAmount: 200, annualValueUsd: 200, enrollmentRequired: true, unit: "USD", periodAmount: thisMonth === 12 ? 35 : 15 });
  });

  it("validation: override keys, period mismatch, every_n_years, dates", async () => {
    expect((await call("POST", `/accounts/${acct}/benefits`, { name: "x", amount: 1, period: "monthly", amountByPeriod: { "13": 1 } })).status).toBe(400);
    expect((await call("POST", `/accounts/${acct}/benefits`, { name: "x", amount: 1, period: "quarterly", amountByPeriod: { "5": 1 } })).status).toBe(400);
    expect((await call("POST", `/accounts/${acct}/benefits`, { name: "x", amount: 1, period: "annual", amountByPeriod: { "1": 1 } })).status).toBe(400);
    expect((await call("POST", `/accounts/${acct}/benefits`, { name: "x", amount: 120, period: "every_n_years" })).status).toBe(400);
    expect((await call("POST", `/accounts/${acct}/benefits`, { name: "x", amount: 1, period: "monthly", startsAt: "2026-05-01", endsAt: "2026-04-01" })).status).toBe(400);
    expect((await call("POST", `/accounts/${acct}/benefits`, { name: "x", amount: 1, period: "monthly", unit: "points" })).status).toBe(400);
  });

  it("every_n_years accepts fractional years (stored as months) and anchors at startsAt", async () => {
    const r = await call("POST", `/accounts/${acct}/benefits`, { name: "TSA PreCheck", amount: 85, period: "every_n_years", everyYears: 4.5, startsAt: "2023-01-15" });
    expect(r.status).toBe(201);
    expect(r.body.everyMonths).toBe(54);
    expect(r.body.currentPeriod.start).toBe("2023-01-15");
    expect(r.body.annualAmount).toBeCloseTo(85 / 4.5);
  });

  it("free night certificates: counted per cardmember year; mark used defaults to 1 unit", async () => {
    const r = await call("POST", `/accounts/${acct}/benefits`, { name: "Free night", amount: 1, unit: "free_night", period: "cardmember_year", valueDescription: "Up to 35k points", estValueUsd: 250 });
    expect(r.body).toMatchObject({ unused: true, remaining: 1, annualValueUsd: 250 });
    // anchor Feb 29 -> anniversaries on Feb 28 in non-leap years
    expect(r.body.currentPeriod.start.slice(5)).toMatch(/^02-2[89]$/);
    const use = await call("POST", `/benefits/${r.body.id}/uses`, { usedOn: today });
    expect(use.body.amount).toBe(1);
    const list = (await call("GET", `/benefits?accountId=${acct}`)).body;
    expect(list.find((b: any) => b.id === r.body.id)).toMatchObject({ unused: false, used: 1 });
  });

  it("USD mark used defaults to what is left this period", async () => {
    const r = await call("POST", `/accounts/${acct}/benefits`, { name: "Dining", amount: 10, period: "monthly" });
    await call("POST", `/benefits/${r.body.id}/uses`, { usedOn: today, amount: 4 });
    expect((await call("POST", `/benefits/${r.body.id}/uses`, { usedOn: today })).body.amount).toBe(6);
  });

  it("update: partial edits, period change drops overrides, archive and date bounds hide it", async () => {
    const r = await call("POST", `/accounts/${acct}/benefits`, { name: "Streaming", amount: 20, period: "monthly", amountByPeriod: { "1": 0 } });
    const u = await call("PATCH", `/benefits/${r.body.id}`, { period: "annual", amount: 240, notes: "changed" });
    expect(u.body).toMatchObject({ period: "annual", amount: 240, amountByPeriod: null, notes: "changed" });
    expect((await call("PATCH", `/benefits/${r.body.id}`, { bogus: 1 })).status).toBe(400);

    await call("PATCH", `/benefits/${r.body.id}`, { active: false });
    expect((await call("GET", `/benefits?accountId=${acct}`)).body.some((b: any) => b.id === r.body.id)).toBe(false);
    expect((await call("GET", `/benefits?accountId=${acct}&inactive=1`)).body.some((b: any) => b.id === r.body.id)).toBe(true);

    const ended = await call("POST", `/accounts/${acct}/benefits`, { name: "Ended credit", amount: 50, period: "annual", endsAt: "2020-01-01" });
    const future = await call("POST", `/accounts/${acct}/benefits`, { name: "Future credit", amount: 50, period: "annual", startsAt: "2099-01-01" });
    const dash = (await call("GET", "/dashboard")).body;
    const ids = dash.unusedBenefits.map((b: any) => b.id);
    expect(ids).not.toContain(ended.body.id);
    expect(ids).not.toContain(future.body.id);
    expect(ids).not.toContain(r.body.id);
    const acctSummary = (await call("GET", "/accounts")).body.find((a: any) => a.id === acct);
    // Uber, PreCheck, Dining(after full use: no) -> unused count respects new periods/bounds
    expect(acctSummary.unusedBenefits).toBe(dash.unusedBenefits.filter((b: any) => b.accountId === acct).length);
  });
});

describe("benefit MCP tools + owner scoping", () => {
  it("add / update / delete via MCP; another user cannot touch them", async () => {
    const owner = "tester@example.com";
    const acct = (await mcp(owner, "add_account", { productId: "chase-sapphire-reserve", openedAt: "2025-01-10" })).data.id;
    const ge = await mcp(owner, "add_benefit", { accountId: acct, name: "Global Entry", amount: 120, period: "every_n_years", everyYears: 4, enrollmentRequired: false, limitations: "Application fee credit" });
    expect(ge.isError).toBe(false);
    expect(ge.data).toMatchObject({ everyMonths: 48, accountId: acct });
    const upd = await mcp(owner, "update_benefit", { benefitId: ge.data.id, amount: 120, sourceUrl: "https://example.com/ge", endsAt: "2030-01-01" });
    expect(upd.data).toMatchObject({ sourceUrl: "https://example.com/ge", endsAt: "2030-01-01" });
    const listed = await mcp(owner, "list_benefits", { accountId: acct });
    expect(listed.data[0]).toMatchObject({ name: "Global Entry", unit: "USD", annualAmount: 30 });
    expect((await mcp(owner, "mark_benefit_used", { benefitId: ge.data.id })).data.amount).toBe(120);

    const intruder = "someone-else@example.com";
    expect((await mcp(intruder, "add_benefit", { accountId: acct, name: "x", amount: 1, period: "monthly" })).isError).toBe(true);
    expect((await mcp(intruder, "update_benefit", { benefitId: ge.data.id, amount: 1 })).isError).toBe(true);
    expect((await mcp(intruder, "delete_benefit", { benefitId: ge.data.id })).isError).toBe(true);
    expect((await mcp(intruder, "mark_benefit_used", { benefitId: ge.data.id })).isError).toBe(true);
    expect((await mcp(intruder, "list_benefits", {})).data).toEqual([]);

    expect((await mcp(owner, "delete_benefit", { benefitId: ge.data.id })).data.deleted).toBe(ge.data.id);
    expect((await mcp(owner, "list_benefits", { accountId: acct, includeInactive: true })).data).toEqual([]);
  });
});
