import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const fetchW = (req: Request) => (exports as any).default.fetch(req) as Promise<Response>;
const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const REDIRECT = "https://client.example/cb";

async function register() {
  const res = await fetchW(
    new Request("http://localhost/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_name: "Test Client", redirect_uris: [REDIRECT], token_endpoint_auth_method: "none" }),
    }),
  );
  expect(res.status).toBe(201);
  return ((await res.json()) as { client_id: string }).client_id;
}

async function pkce() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  return { verifier, challenge };
}

function authorizeUrl(host: string, clientId: string, challenge: string) {
  const u = new URL(`${host}/authorize`);
  u.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: "st-123",
    scope: "mcp",
    resource: "http://localhost/mcp",
  }).toString();
  return u.toString();
}

const cookiesFrom = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");

async function consent(clientId: string, challenge: string, decision: "approve" | "deny") {
  const page = await fetchW(new Request(authorizeUrl("http://localhost", clientId, challenge), { headers: { "Accept-Language": "zh-CN" } }));
  expect(page.status).toBe(200);
  const html = await page.text();
  expect(html).toContain("允许 Test Client 访问 Bonus");
  expect(html).toContain("tester@example.com");
  const handle = html.match(/name="handle" value="([^"]+)"/)![1]!;
  const res = await fetchW(
    new Request("http://localhost/authorize", {
      method: "POST",
      headers: { Cookie: cookiesFrom(page), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ handle, decision }).toString(),
      redirect: "manual",
    }),
  );
  expect(res.status).toBe(302);
  return new URL(res.headers.get("Location")!);
}

describe("MCP OAuth (Access-protected /authorize, no upstream IdP)", () => {
  it("refuses /authorize without a Cloudflare Access identity", async () => {
    const clientId = await register();
    const { challenge } = await pkce();
    const res = await fetchW(new Request(authorizeUrl("https://bonus.example.com", clientId, challenge)));
    expect(res.status).toBe(401);
    expect(await res.text()).toContain("Cloudflare Access");
  });

  it("deny redirects back with access_denied", async () => {
    const clientId = await register();
    const { challenge } = await pkce();
    const loc = await consent(clientId, challenge, "deny");
    expect(`${loc.origin}${loc.pathname}`).toBe(REDIRECT);
    expect(loc.searchParams.get("error")).toBe("access_denied");
    expect(loc.searchParams.get("state")).toBe("st-123");
  });

  it("full flow: consent -> code -> token -> /mcp as the Access user", async () => {
    const clientId = await register();
    const { verifier, challenge } = await pkce();
    const loc = await consent(clientId, challenge, "approve");
    const code = loc.searchParams.get("code");
    expect(code).toBeTruthy();
    expect(loc.searchParams.get("state")).toBe("st-123");

    const tokenRes = await fetchW(
      new Request("http://localhost/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: code!,
          redirect_uri: REDIRECT,
          client_id: clientId,
          code_verifier: verifier,
          resource: "http://localhost/mcp",
        }).toString(),
      }),
    );
    expect(tokenRes.status).toBe(200);
    const token = (await tokenRes.json()) as { access_token: string; scope: string };
    expect(token.scope).toBe("mcp");

    const mcp = await fetchW(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          Host: "localhost",
          Authorization: `Bearer ${token.access_token}`,
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "MCP-Protocol-Version": "2025-06-18",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "five_24_status", arguments: {} } }),
      }),
    );
    expect(mcp.status).toBe(200);
    const text = await mcp.text();
    const json = JSON.parse(text.startsWith("{") ? text : text.split("\n").find((l) => l.startsWith("data:"))!.slice(5));
    expect(json.result.isError).toBeFalsy();
    expect(JSON.parse(json.result.content[0].text).limit).toBe(5);
  });

  it("no /callback route any more", async () => {
    const res = await fetchW(new Request("http://localhost/callback"));
    // Falls through to static assets (SPA), never an OAuth handler.
    expect(res.headers.get("Content-Type") ?? "").not.toContain("application/json");
  });

  it("advertises /token and /register in the metadata", async () => {
    const meta = (await (await fetchW(new Request("http://localhost/.well-known/oauth-authorization-server"))).json()) as any;
    expect(meta.token_endpoint).toBe("http://localhost/token");
    expect(meta.registration_endpoint).toBe("http://localhost/register");
    expect(meta.scopes_supported).toEqual(["mcp"]);
  });
});
