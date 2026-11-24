import { createMcpHandler } from "agents/mcp/server";
import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createMcpServer } from "../src/mcp/server";

const props = { email: "mcp-user@example.com" };

async function rpc(method: string, params: unknown, id = 1) {
  const handler = createMcpHandler(() => createMcpServer(env as any, props, () => "2026-11-23"), { authContext: { props } });
  const res = await handler(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers: { Host: "localhost", "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-06-18" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    }),
    env,
    { waitUntil() {}, passThroughOnException() {} } as any,
  );
  const text = await res.text();
  if (!res.ok || !text.includes("result")) console.log("MCP response", res.status, text.slice(0, 500));
  // Response may be JSON or a single SSE event.
  const json = text.startsWith("{") ? text : text.split("\n").find((l) => l.startsWith("data:"))!.slice(5);
  return JSON.parse(json);
}

const callTool = async (name: string, args: Record<string, unknown> = {}) => {
  const r = await rpc("tools/call", { name, arguments: args });
  const content = r.result?.content?.[0]?.text;
  return { isError: !!r.result?.isError, data: content && !r.result?.isError ? JSON.parse(content) : content, raw: r };
};

describe("MCP server", () => {
  it("lists the phase-1 tools", async () => {
    const r = await rpc("tools/list", {});
    const names = r.result.tools.map((t: any) => t.name).sort();
    expect(names).toEqual(
      ["add_account", "delete_account", "add_institution", "add_offer", "add_product", "archive_product", "list_institutions", "list_opportunities", "update_account", "update_institution", "update_offer", "update_product", "check_eligibility", "five_24_status", "get_account", "list_accounts", "list_benefits", "list_bonuses", "list_products", "mark_benefit_used", "record_event", "upcoming_deadlines"].sort(),
    );
  });

  it("tools share the service layer and are scoped to the OAuth user", async () => {
    const add = await callTool("add_account", { productId: "amex-gold", last4: "0002", openedAt: "2026-09-20" });
    expect(add.isError).toBe(false);
    expect(add.data.ownerId).toBe("mcp-user@example.com");
    const accountId = add.data.id;

    expect((await callTool("add_account", { productId: "amex-gold", last4: "378282246310005" })).isError).toBe(true);

    const ev = await callTool("record_event", { accountId, type: "note", date: "2026-10-01", note: "called retention" });
    expect(ev.data.type).toBe("note");

    const list = await callTool("list_accounts");
    expect(list.data).toHaveLength(1);
    expect((await callTool("get_account", { accountId })).data.events.length).toBe(2);

    const five = await callTool("five_24_status");
    expect(five.data.count).toBe(1);

    const elig = await callTool("check_eligibility", { productId: "amex-gold" });
    expect(elig.data.status).toBe("blocked");
    expect((await callTool("check_eligibility", { productId: "does-not-exist" })).isError).toBe(true);

    expect((await callTool("upcoming_deadlines")).data).toEqual([]);
    expect((await callTool("list_benefits")).data).toEqual([]);
  });

  it("catalog and account editing tools", async () => {
    const inst = await callTool("add_institution", { name: "Example PenFed-like CU", type: "bank" });
    expect(inst.isError).toBe(false);
    const prod = await callTool("add_product", { institutionId: "chase", name: "Example Hotel Card", annualFee: 95, currency: "World of Hyatt", family: "chase_hyatt", rules: { bonusCooldownMonths: 24 } });
    expect(prod.data).toMatchObject({ id: "chase-example-hotel-card", annualFee: 95 });
    expect((await callTool("list_products", { q: "example hotel" })).data[0].source).toBe("user");
    expect((await callTool("update_product", { productId: "amex-hilton-aspire", annualFee: 550, rules: { familyRank: 3 } })).data.customized).toBe(true);
    expect((await callTool("update_institution", { institutionId: inst.data.id, name: "Renamed CU" })).data.name).toBe("Renamed CU");

    const acct = await callTool("add_account", { productId: "chase-sapphire-preferred", openedAt: "2024-05-01" });
    const pc = await callTool("record_event", { accountId: acct.data.id, type: "downgrade", date: "2025-05-01", toProductId: prod.data.id });
    expect(pc.isError).toBe(false);
    const upd = await callTool("update_account", { accountId: acct.data.id, nickname: "Hotel", last4: "9876", notes: "pc'd" });
    expect(upd.data).toMatchObject({ nickname: "Hotel", last4: "9876", productId: prod.data.id });
    expect((await callTool("update_account", { accountId: acct.data.id, last4: "4111111111111111" })).isError).toBe(true);

    expect((await callTool("archive_product", { productId: prod.data.id })).data.archived).toBe(true);
    expect((await callTool("list_products", { q: "example hotel" })).data).toHaveLength(0);
    expect((await callTool("get_account", { accountId: acct.data.id })).data.productName).toBe("Example Hotel Card");

    expect((await callTool("delete_account", { accountId: acct.data.id })).data.deleted).toBe(acct.data.id);
    expect((await callTool("get_account", { accountId: acct.data.id })).isError).toBe(true);
  });

  it("/mcp requires an OAuth bearer token", async () => {
    const res = await (exports as any).default.fetch(new Request("http://localhost/mcp", { method: "POST", body: "{}" }));
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toMatch(/Bearer/);
  });

  it("publishes OAuth metadata for MCP clients", async () => {
    const res = await (exports as any).default.fetch(new Request("http://localhost/.well-known/oauth-authorization-server"));
    const meta = (await res.json()) as any;
    expect(meta.authorization_endpoint).toBe("http://localhost/authorize");
    expect(meta.registration_endpoint).toBe("http://localhost/register");
  });
});
