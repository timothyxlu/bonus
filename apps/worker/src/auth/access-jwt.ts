import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";
import type { Env } from "../env";

export interface Identity {
  email: string;
  sub?: string;
  source: "access" | "dev" | "mcp";
  /** When the Access login happened (JWT iat, seconds). Used to require a recent login for secrets. */
  iat?: number;
}

export class AuthError extends Error {
  constructor(
    message: string,
    public status: 401 | 403 = 401,
  ) {
    super(message);
  }
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function jwks(teamDomain: string) {
  let set = jwksCache.get(teamDomain);
  if (!set) {
    set = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
    jwksCache.set(teamDomain, set);
  }
  return set;
}

export function normalizeTeamDomain(d: string) {
  const withProto = d.startsWith("http") ? d : `https://${d}`;
  return withProto.replace(/\/+$/, "");
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function isLocalRequest(request: Request) {
  return LOCAL_HOSTS.has(new URL(request.url).hostname);
}

export function emailAllowed(env: Env, email: string) {
  const list = (env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.length === 0 || list.includes(email.toLowerCase());
}

/**
 * Verify the Cloudflare Access JWT on the request (Cf-Access-Jwt-Assertion header,
 * falling back to the CF_Authorization cookie). We never trust the edge alone:
 * signature, issuer, audience and expiry are all checked here.
 */
export async function verifyAccessRequest(request: Request, env: Env): Promise<Identity> {
  if (env.DEV_USER_EMAIL && isLocalRequest(request)) {
    // Local dev only: the login time can be simulated with X-Dev-Auth-Iat (tests of the re-auth check).
    const simulated = Number(request.headers.get("X-Dev-Auth-Iat"));
    return { email: env.DEV_USER_EMAIL.toLowerCase(), source: "dev", iat: Number.isFinite(simulated) && simulated > 0 ? simulated : Math.floor(Date.now() / 1000) };
  }
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
    throw new AuthError("Server is missing ACCESS_TEAM_DOMAIN / ACCESS_AUD configuration", 401);
  }
  const token = request.headers.get("Cf-Access-Jwt-Assertion") ?? readCookie(request, "CF_Authorization");
  if (!token) throw new AuthError("Missing Cloudflare Access token");
  const issuer = normalizeTeamDomain(env.ACCESS_TEAM_DOMAIN);
  return verifyAccessToken(token, env, jwks(issuer));
}

/** Verify a Cloudflare Access JWT against a key set (exported for tests). */
export async function verifyAccessToken(token: string, env: Env, keys: JWTVerifyGetKey): Promise<Identity> {
  const issuer = normalizeTeamDomain(env.ACCESS_TEAM_DOMAIN ?? "");
  let payload: JWTPayload & { email?: string };
  try {
    ({ payload } = await jwtVerify(token, keys, { issuer, audience: env.ACCESS_AUD, algorithms: ["RS256"] }));
  } catch (err) {
    throw new AuthError(`Invalid Cloudflare Access token: ${(err as Error).message}`);
  }
  const email = typeof payload.email === "string" ? payload.email.toLowerCase() : undefined;
  if (!email) throw new AuthError("Access token has no email (service tokens are not supported)", 403);
  if (!emailAllowed(env, email)) throw new AuthError("This account is not allowed", 403);
  return { email, sub: payload.sub, source: "access", iat: payload.iat };
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}
