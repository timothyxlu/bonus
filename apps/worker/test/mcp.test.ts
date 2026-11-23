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
      ["add_account", "check_eligibility", "five_24_status", "get_account", "list_accounts", "list_benefits", "list_bonuses", "list_products", "mark_benefit_used", "record_event", "upcoming_deadlines"].sort(),
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
