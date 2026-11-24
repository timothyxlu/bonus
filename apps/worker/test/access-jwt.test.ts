import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { verifyAccessToken } from "../src/auth/access-jwt";
import type { Env } from "../src/env";

const team = "https://example-team.cloudflareaccess.com";
const env = { ACCESS_TEAM_DOMAIN: team, ACCESS_AUD: "aud-123" } as Env;

async function setup() {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" };
  const keys = createLocalJWKSet({ keys: [jwk] });
  const sign = (claims: Record<string, unknown>, opts: { aud?: string; iss?: string; exp?: string } = {}) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(opts.iss ?? team)
      .setAudience(opts.aud ?? "aud-123")
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? "5m")
      .sign(privateKey);
  return { keys, sign };
}

describe("Cloudflare Access JWT verification", () => {
  it("accepts a valid token and lower-cases the email", async () => {
    const { keys, sign } = await setup();
    const id = await verifyAccessToken(await sign({ email: "Owner@Example.com", sub: "u1" }), env, keys);
    expect(id).toMatchObject({ email: "owner@example.com", source: "access" });
  });
  it("rejects wrong audience, wrong issuer and expired tokens", async () => {
    const { keys, sign } = await setup();
    await expect(verifyAccessToken(await sign({ email: "a@b.c" }, { aud: "other" }), env, keys)).rejects.toThrow();
    await expect(verifyAccessToken(await sign({ email: "a@b.c" }, { iss: "https://evil.cloudflareaccess.com" }), env, keys)).rejects.toThrow();
    await expect(verifyAccessToken(await sign({ email: "a@b.c" }, { exp: "-1m" }), env, keys)).rejects.toThrow();
  });
  it("rejects tokens signed by another key", async () => {
    const { keys } = await setup();
    const other = await setup();
    await expect(verifyAccessToken(await other.sign({ email: "a@b.c" }), env, keys)).rejects.toThrow();
  });
  it("enforces the optional email allowlist", async () => {
    const { keys, sign } = await setup();
    const strict = { ...env, ALLOWED_EMAILS: "owner@example.com" } as Env;
    await expect(verifyAccessToken(await sign({ email: "intruder@example.com" }), strict, keys)).rejects.toThrow(/not allowed/);
    await expect(verifyAccessToken(await sign({ email: "owner@example.com" }), strict, keys)).resolves.toBeTruthy();
  });
  it("rejects tokens without an email (service tokens)", async () => {
    const { keys, sign } = await setup();
    await expect(verifyAccessToken(await sign({ common_name: "svc" }), env, keys)).rejects.toThrow(/email/);
  });
});
