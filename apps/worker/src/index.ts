import OAuthProvider, { type OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { createMcpHandler, getMcpAuthContext } from "agents/mcp/server";
import { createApi } from "./api/app";
import { handleAuthorize, MCP_SCOPE } from "./auth/mcp-authorize";
import type { Env, McpProps } from "./env";
import { createMcpServer } from "./mcp/server";
import { withSecurityHeaders } from "./security-headers";

const api = createApi();

/** /mcp - only reached with a valid OAuth access token (enforced by OAuthProvider). */
const mcpApiHandler = {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const handler = createMcpHandler(
      () => {
        const props = getMcpAuthContext()?.props as McpProps | undefined;
        if (!props?.email) throw new Error("Missing authenticated user");
        return createMcpServer(env, props);
      },
      { allowedHostnames: [new URL(env.MCP_RESOURCE).hostname] },
    );
    return handler(request, env, ctx);
  },
};

/** Everything that is not /mcp, /token, /register or OAuth metadata. */
const defaultHandler = {
  async fetch(request: Request, env: Env & { OAUTH_PROVIDER: OAuthHelpers }, ctx: ExecutionContext) {
    const url = new URL(request.url);
    // Behind Cloudflare Access (not bypassed): the Access identity approves the MCP client.
    if (url.pathname === "/authorize") return handleAuthorize(request, env);
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return api.fetch(request, env, ctx);
    return env.ASSETS.fetch(request);
  },
};

let cached: { resource: string; provider: OAuthProvider<Env> } | undefined;

function provider(env: Env) {
  const resource = env.MCP_RESOURCE;
  if (cached?.resource === resource) return cached.provider;
  const origin = new URL(resource).origin;
  const p = new OAuthProvider<Env>({
    apiRoute: "/mcp",
    apiHandler: mcpApiHandler,
    defaultHandler: defaultHandler as ExportedHandler<Env>,
    authorizeEndpoint: "/authorize",
    tokenEndpoint: "/token",
    clientRegistrationEndpoint: "/register",
    clientIdMetadataDocumentEnabled: true,
    scopesSupported: [MCP_SCOPE],
    requiredScopes: [MCP_SCOPE],
    resourceMetadata: { resource, authorization_servers: [origin] },
    accessTokenTTL: 3600,
    refreshTokenTTL: 90 * 86400,
  });
  cached = { resource, provider: p };
  return p;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return withSecurityHeaders(await provider(env).fetch(request, env, ctx));
  },
} satisfies ExportedHandler<Env>;
