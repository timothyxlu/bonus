import { createMcpHandler } from "agents/mcp/server";
import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createMcpServer } from "../src/mcp/server";

const DB = (env as unknown as { DB: D1Database }).DB;
// Well-known public test numbers / fake values only.
const PAN = "4111111111111111";
const AMEX = "378282246310005";
const CVV = "737";
const GIFT_NO = "GIFT-7777-8888";
const GIFT_PIN = "4242";
const SECRETS = [PAN, AMEX, CVV, "12/30", GIFT_NO, GIFT_PIN, "7777-8888"];

const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
  const res = await (exports as any).default.fetch(
    new Request(`http://localhost/api${path}`, {
      method,
      headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
  const text = await res.text();
  return { status: res.status, headers: res.headers, text, body: text ? JSON.parse(text) : null };
};
/**
 * Long values (card / gift numbers) are matched as substrings. Short ones (CVV, PIN, expiry)
 * are matched as JSON string values, so random digits inside UUIDs or timestamps don't
 * cause false positives - a real leak would serialise them as "737".
 */
const noSecrets = (label: string, text: string) => {
  for (const s of SECRETS) {
    const needle = s.length >= 8 ? s : `"${s}"`;
    expect(text.includes(needle), `${label} leaked ${s.slice(0, 2)}…`).toBe(false);
  }
};

let cardId = "";
let giftId = "";

describe("account secrets (web only)", () => {
  it("is configured, writes encrypted values, keeps trailing digits in sync", async () => {
    expect((await call("GET", "/secrets/status")).body.keyStatus).toBe("ok");
    cardId = (await call("POST", "/accounts", { productId: "amex-platinum", openedAt: "2025-01-01" })).body.id;
    const bad = await call("PUT", `/accounts/${cardId}/secret`, { pan: "4111111111111112" });
    expect(bad.status).toBe(400);
    expect(bad.text).toMatch(/Luhn/);
    expect(bad.text).not.toContain("4111111111111112");
    expect((await call("PUT", `/accounts/${cardId}/secret`, { pin: "1" })).status).toBe(400);

    const w = await call("PUT", `/accounts/${cardId}/secret`, { pan: AMEX, exp: "12/30", cvv: CVV });
    expect(w.status).toBe(200);
    expect(w.headers.get("Cache-Control")).toBe("no-store");
    expect(w.body).toMatchObject({ keyStatus: "ok", stored: ["cvv", "exp", "pan"] });
    noSecrets("write response", w.text);
    expect((await call("GET", `/accounts/${cardId}`)).body.last4).toBe("10005");

    const raw = await DB.prepare("SELECT * FROM account_secrets WHERE account_id = ?").bind(cardId).first<Record<string, string>>();
    noSecrets("stored row", JSON.stringify(raw));
    expect(raw?.key_id).toBe("k1");

    // partial update + null removes a field
    await call("PUT", `/accounts/${cardId}/secret`, { pan: PAN, cvv: null });
    expect((await call("GET", `/accounts/${cardId}`)).body.last4).toBe("1111");
    expect((await call("GET", `/accounts/${cardId}/secret`)).body.stored).toEqual(["exp", "pan"]);
    await call("PUT", `/accounts/${cardId}/secret`, { cvv: CVV });
  });

  it("gift cards store number + PIN with the same protections", async () => {
    const inst = await call("POST", "/institutions", { name: "Secret Test Grocer", type: "merchant" });
    giftId = (await call("POST", "/accounts", { kind: "gift_card", institutionId: inst.body.id, nickname: "Grocer card" })).body.id;
    expect((await call("PUT", `/accounts/${giftId}/secret`, { pan: PAN })).status).toBe(400);
    expect((await call("PUT", `/accounts/${giftId}/secret`, { number: GIFT_NO, pin: GIFT_PIN })).body.stored).toEqual(["number", "pin"]);
    const bank = (await call("POST", "/accounts", { kind: "bank_account", institutionId: "chase", nickname: "Checking" })).body.id;
    expect((await call("GET", `/accounts/${bank}/secret`)).body.supported).toBe(false);
    expect((await call("PUT", `/accounts/${bank}/secret`, { number: "1234" })).status).toBe(400);
  });

  it("reveal: POST only, recent login required, no-store, audited without values", async () => {
    expect((await call("GET", `/accounts/${cardId}/secret/reveal`)).status).toBe(404);
    const stale = await call("POST", `/accounts/${cardId}/secret/reveal`, undefined, { "X-Dev-Auth-Iat": String(Math.floor(Date.now() / 1000) - 3600) });
    expect(stale.status).toBe(401);
    expect(stale.body.code).toBe("reauth_required");
    noSecrets("stale reveal", stale.text);

    const r = await call("POST", `/accounts/${cardId}/secret/reveal`);
    expect(r.status).toBe(200);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    expect(r.body.values).toEqual({ pan: PAN, exp: "12/30", cvv: CVV });
    expect((await call("POST", `/accounts/${giftId}/secret/reveal`)).body.values).toEqual({ number: GIFT_NO, pin: GIFT_PIN });

    const auditRows = await DB.prepare("SELECT * FROM secret_audit").all();
    noSecrets("audit", JSON.stringify(auditRows.results));
    const actions = auditRows.results.map((r: any) => r.action);
    expect(actions).toContain("reveal");
    expect(actions).toContain("reveal_denied");
    expect(actions).toContain("write");
  });

  it("ciphertext cannot be swapped between accounts", async () => {
    const other = (await call("POST", "/accounts", { productId: "amex-gold" })).body.id;
    await call("PUT", `/accounts/${other}/secret`, { cvv: "999" });
    await DB.prepare(
      "UPDATE account_secrets SET iv = (SELECT iv FROM account_secrets WHERE account_id = ?1), ciphertext = (SELECT ciphertext FROM account_secrets WHERE account_id = ?1), fields = (SELECT fields FROM account_secrets WHERE account_id = ?1) WHERE account_id = ?2",
    )
      .bind(cardId, other)
      .run();
    const r = await call("POST", `/accounts/${other}/secret/reveal`);
    expect(r.status).toBe(500);
    expect(r.body.code).toBe("decrypt_failed");
    noSecrets("swapped reveal", r.text);
  });

  it("never appears in list/detail/dashboard/bonus/opportunity/product endpoints, and import refuses it", async () => {
    for (const path of ["/accounts", `/accounts/${cardId}`, `/accounts/${giftId}`, "/dashboard", "/bonuses", "/opportunities", "/products", "/benefits", "/eligibility", "/eligibility/five24"]) {
      const r = await call("GET", path);
      expect(r.status, path).toBe(200);
      noSecrets(path, r.text);
    }
    const imp = await call("POST", "/import", { version: 1, accounts: [{ product: "amex-gold", pan: PAN }] });
    expect(imp.status).toBe(400);
    noSecrets("import error", imp.text);
  });

  it("MCP never exposes secrets: every tool's output is scanned", async () => {
    const props = { email: "tester@example.com" };
    const handler = createMcpHandler(() => createMcpServer(env as any, props), { authContext: { props } });
    const rpc = async (method: string, params: unknown) => {
      const res = await handler(
        new Request("http://localhost/mcp", {
          method: "POST",
          headers: { Host: "localhost", "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-06-18" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        }),
        env,
        { waitUntil() {}, passThroughOnException() {} } as any,
      );
      const raw = await res.text();
      // Scan the decoded tool output (JSON text inside the JSON-RPC envelope), not the escaped envelope.
      const json = JSON.parse(raw.startsWith("{") ? raw : raw.split("\n").find((l) => l.startsWith("data:"))!.slice(5));
      const texts = (json.result?.content ?? []).map((c: any) => c.text ?? "").join("\n");
      return `${texts}\n${json.error?.message ?? ""}\n${raw}`;
    };
    const listRaw = (await rpc("tools/list", {})).split("\n").find((l) => l.includes('"tools"')) ?? "";
    const list = JSON.parse(listRaw.startsWith("data:") ? listRaw.slice(5) : listRaw);
    const names: string[] = (list.result?.tools ?? []).map((t: any) => t.name);
    expect(names.length).toBeGreaterThan(20);
    expect(names.some((n) => /secret|pan|cvv|pin/i.test(n))).toBe(false);
    const args: Record<string, unknown> = {
      get_account: { accountId: cardId },
      list_accounts: {},
      list_products: {},
      list_institutions: {},
      list_benefits: {},
      list_bonuses: {},
      upcoming_deadlines: {},
      check_eligibility: { productId: "amex-platinum" },
      five_24_status: {},
      list_opportunities: {},
      update_account: { accountId: cardId, notes: "scan" },
      record_event: { accountId: cardId, type: "note", date: "2026-01-01" },
    };
    for (const name of names) {
      const out = await rpc("tools/call", { name, arguments: args[name] ?? {} });
      noSecrets(`tool ${name}`, out);
    }
    noSecrets("get_account gift", await rpc("tools/call", { name: "get_account", arguments: { accountId: giftId } }));
  });

  it("deleting the account deletes its secrets", async () => {
    await call("DELETE", `/accounts/${giftId}`);
    expect(await DB.prepare("SELECT count(*) AS n FROM account_secrets WHERE account_id = ?").bind(giftId).first("n")).toBe(0);
  });

  it("reveal is rate limited", async () => {
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await call("POST", `/accounts/${cardId}/secret/reveal`)).status;
    expect(last).toBe(429);
  });
});
