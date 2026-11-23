/**
 * OAuth "default handler" for the MCP authorization flow, adapted from
 * Cloudflare's remote-mcp-cf-access demo (MIT). The Worker is the OAuth server
 * for MCP clients (Claude.ai / Claude Code) and an OAuth client of a
 * Cloudflare Access for SaaS (OIDC) application, which authenticates the user
 * with GitHub.
 */
import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Env, McpProps } from "../env";
import { emailAllowed } from "./access-jwt";
import {
  addApprovedClient,
  createOAuthState,
  fetchUpstreamAuthToken,
  generateCSRFProtection,
  getUpstreamAuthorizeUrl,
  isClientApproved,
  OAuthError,
  renderApprovalDialog,
  validateCSRFToken,
  validateOAuthState,
} from "./oauth-utils";

type EnvWithOauth = Env & { OAUTH_PROVIDER: OAuthHelpers };

const REQUIRED = [
  "ACCESS_CLIENT_ID",
  "ACCESS_CLIENT_SECRET",
  "ACCESS_TOKEN_URL",
  "ACCESS_AUTHORIZATION_URL",
  "ACCESS_JWKS_URL",
  "COOKIE_ENCRYPTION_KEY",
] as const;

function missingConfig(env: Env) {
  return REQUIRED.filter((k) => !env[k]);
}

export const OAUTH_PATHS = new Set(["/authorize", "/callback"]);

export async function handleMcpOAuth(request: Request, env: EnvWithOauth): Promise<Response> {
  const { pathname, searchParams } = new URL(request.url);
  const missing = missingConfig(env);
  if (missing.length) return new Response(`MCP OAuth is not configured (missing: ${missing.join(", ")})`, { status: 503 });
  const secret = env.COOKIE_ENCRYPTION_KEY!;

  if (request.method === "GET" && pathname === "/authorize") {
    const oauthReqInfo = await env.OAUTH_PROVIDER.parseAuthRequest(request);
    const { clientId } = oauthReqInfo;
    if (!clientId) return new Response("Invalid request", { status: 400 });

    if (await isClientApproved(request, clientId, secret)) {
      const { stateToken, codeChallenge } = await createOAuthState(oauthReqInfo, env.OAUTH_KV, secret);
      return redirectToAccess(request, env, stateToken, codeChallenge);
    }
    const { token: csrfToken, setCookie } = generateCSRFProtection();
    return renderApprovalDialog(request, {
      client: await env.OAUTH_PROVIDER.lookupClient(clientId),
      csrfToken,
      server: {
        name: "Bonus",
        description: "Personal rewards & bonus tracker. Sign in with Cloudflare Access (GitHub) to grant this MCP client access to your data.",
      },
      setCookie,
      state: { oauthReqInfo },
    });
  }

  if (request.method === "POST" && pathname === "/authorize") {
    try {
      const formData = await request.formData();
      const csrf = validateCSRFToken(formData, request);
      const encodedState = formData.get("state");
      if (!encodedState || typeof encodedState !== "string") return new Response("Missing state", { status: 400 });
      let state: { oauthReqInfo?: AuthRequest };
      try {
        state = JSON.parse(atob(encodedState));
      } catch {
        return new Response("Invalid state", { status: 400 });
      }
      if (!state.oauthReqInfo?.clientId) return new Response("Invalid request", { status: 400 });
      const approved = await addApprovedClient(request, state.oauthReqInfo.clientId, secret);
      const { stateToken, codeChallenge } = await createOAuthState(state.oauthReqInfo, env.OAUTH_KV, secret);
      const headers = new Headers();
      headers.append("Set-Cookie", approved);
      headers.append("Set-Cookie", csrf.clearCookie);
      return redirectToAccess(request, env, stateToken, codeChallenge, headers);
    } catch (error) {
      if (error instanceof OAuthError) return error.toResponse();
      console.error("POST /authorize", error);
      return new Response("Internal server error", { status: 500 });
    }
  }

  if (request.method === "GET" && pathname === "/callback") {
    let oauthReqInfo: AuthRequest;
    let codeVerifier: string;
    try {
      ({ oauthReqInfo, codeVerifier } = await validateOAuthState(request, env.OAUTH_KV, secret));
    } catch (error) {
      if (error instanceof OAuthError) return error.toResponse();
      return new Response("Internal server error", { status: 500 });
    }
    if (!oauthReqInfo.clientId) return new Response("Invalid OAuth request data", { status: 400 });

    const [, idToken, errResponse] = await fetchUpstreamAuthToken({
      client_id: env.ACCESS_CLIENT_ID!,
      client_secret: env.ACCESS_CLIENT_SECRET!,
      code: searchParams.get("code") ?? undefined,
      redirect_uri: new URL("/callback", request.url).href,
      upstream_url: env.ACCESS_TOKEN_URL!,
      code_verifier: codeVerifier,
    });
    if (errResponse) return errResponse;

    let claims: { email?: string; name?: string; sub?: string };
    try {
      const { payload } = await jwtVerify(idToken, createRemoteJWKSet(new URL(env.ACCESS_JWKS_URL!)), {
        audience: env.ACCESS_CLIENT_ID!,
      });
      claims = payload as typeof claims;
    } catch (err) {
      return new Response(`Invalid id_token: ${(err as Error).message}`, { status: 401 });
    }
    const email = claims.email?.toLowerCase();
    if (!email) return new Response("id_token has no email", { status: 403 });
    if (!emailAllowed(env, email)) return new Response("This account is not allowed", { status: 403 });

    const props: McpProps = { email, name: claims.name, sub: claims.sub };
    const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
      request: oauthReqInfo,
      userId: email,
      metadata: { label: claims.name ?? email },
      scope: oauthReqInfo.scope,
      props,
    });
    return Response.redirect(redirectTo, 302);
  }

  return new Response("Not Found", { status: 404 });
}

function redirectToAccess(request: Request, env: Env, stateToken: string, codeChallenge: string, extra = new Headers()) {
  const headers = new Headers(extra);
  headers.set(
    "location",
    getUpstreamAuthorizeUrl({
      client_id: env.ACCESS_CLIENT_ID!,
      code_challenge: codeChallenge,
      redirect_uri: new URL("/callback", request.url).href,
      scope: "openid email profile",
      state: stateToken,
      upstream_url: env.ACCESS_AUTHORIZATION_URL!,
    }),
  );
  return new Response(null, { headers, status: 302 });
}
