import { createMcpHandler } from "agents/mcp/server";
import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createMcpServer } from "../src/mcp/server";

const call = async (method: string, path: string, body?: unknown) => {
  const res = await (exports as any).default.fetch(new Request(`http://localhost/api${path}`, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }));
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};

async function mcp(email: string, name: string, args: Record<string, unknown>) {
  const props = { email };
  const handler = createMcpHandler(() => createMcpServer(env as any, props, () => "2026-11-23"), { authContext: { props } });
  const res = await handler(new Request("http://localhost/mcp", {
    method: "POST",
    headers: { Host: "localhost", "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-06-18" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  }), env, { waitUntil() {}, passThroughOnException() {} } as any);
  const text = await res.text();
  const json = JSON.parse(text.startsWith("{") ? text : text.split("\n").find((l) => l.startsWith("data:"))!.slice(5));
  const content = json.result?.content?.[0]?.text;
  return { isError: !!json.result?.isError, data: content && !json.result?.isError ? JSON.parse(content) : content };
}

describe("hotel free-night certificates", () => {
  it("tracks issued certificates separately, validates source benefits, and derives status", async () => {
    const account = (await call("POST", "/accounts", { productId: "amex-hilton-aspire", openedAt: "2025-01-01" })).body;
    const benefit = (await call("POST", `/accounts/${account.id}/benefits`, {
      name: "Annual free night", amount: 1, unit: "free_night", period: "cardmember_year",
    })).body;

    expect((await call("POST", `/accounts/${account.id}/hotel-certificates`, { hotelProgram: "Hilton Honors" })).status).toBe(400);
    const created = await call("POST", `/accounts/${account.id}/hotel-certificates`, {
      benefitId: benefit.id,
      name: "Hilton Free Night Reward",
      hotelProgram: "Hilton Honors",
      expiresOn: "2099-12-31",
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ status: "unused", accountId: account.id, benefitId: benefit.id });

    const list = await call("GET", "/hotel-certificates?status=unused&expiringWithinDays=99999");
    expect(list.status).toBe(400); // bounded filter validation
    const all = await call("GET", "/hotel-certificates");
    expect(all.body.find((c: any) => c.id === created.body.id)).toMatchObject({ hotelProgram: "Hilton Honors", accountLabel: expect.any(String) });

    const used = await call("POST", `/hotel-certificates/${created.body.id}/use`, { usedAt: "2027-05-10" });
    expect(used.body).toMatchObject({ status: "used", usedAt: "2027-05-10" });
    expect((await call("PATCH", `/hotel-certificates/${created.body.id}`, { usedAt: null, expiresOn: "2020-01-01" })).body.status).toBe("expired");

    // The recurring entitlement remains unchanged and has no invented certificate expiration.
    const benefits = (await call("GET", `/benefits?accountId=${account.id}`)).body;
    expect(benefits.find((b: any) => b.id === benefit.id)).toMatchObject({ unit: "free_night", endsAt: null });
  });

  it("supports MCP CRUD and owner scoping", async () => {
    const owner = "cert-owner@example.com";
    const account = (await mcp(owner, "add_account", { productId: "amex-hilton-aspire", openedAt: "2025-01-01" })).data;
    const added = await mcp(owner, "add_hotel_certificate", { accountId: account.id, hotelProgram: "World of Hyatt", expiresOn: "2027-03-01" });
    expect(added.isError).toBe(false);
    expect((await mcp(owner, "list_hotel_certificates", { status: "unused" })).data[0].id).toBe(added.data.id);
    expect((await mcp(owner, "mark_hotel_certificate_used", { certificateId: added.data.id, usedAt: "2026-12-01" })).data.status).toBe("used");
    expect((await mcp("intruder@example.com", "update_hotel_certificate", { certificateId: added.data.id, name: "nope" })).isError).toBe(true);
    expect((await mcp("intruder@example.com", "list_hotel_certificates", {})).data).toEqual([]);
    expect((await mcp(owner, "delete_hotel_certificate", { certificateId: added.data.id })).data.deleted).toBe(added.data.id);
  });
});
