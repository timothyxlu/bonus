import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { createMcpHandler, getMcpAuthContext } from "agents/mcp/server";
import { createApi } from "./api/app";
import { handleMcpOAuth, OAUTH_PATHS } from "./auth/mcp-oauth-handler";
import type { Env, McpProps } from "./env";
import { createMcpServer } from "./mcp/server";

const api = createApi();

/** /mcp - only reached with a valid OAuth access token (enforced by OAuthProvider). */
const mcpApiHandler = {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const handler = createMcpHandler(() => {
      const props = getMcpAuthContext()?.props as McpProps | undefined;
      if (!props?.email) throw new Error("Missing authenticated user");
      return createMcpServer(env, props);
    }, { allowedHostnames: [new URL(env.MCP_RESOURCE).hostname] });
    return handler(request, env, ctx);
  },
};

/** Everything that is not /mcp: OAuth UI endpoints, the REST API, then static assets (SPA). */
const defaultHandler = {
  async fetch(request: Request, env: Env & { OAUTH_PROVIDER: any }, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (OAUTH_PATHS.has(url.pathname)) return handleMcpOAuth(request, env);
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return api.fetch(request, env, ctx);
    return env.ASSETS.fetch(request);
  },
};

let provider: OAuthProvider<Env> | undefined;

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    provider ??= new OAuthProvider<Env>({
      apiRoute: "/mcp",
      apiHandler: mcpApiHandler,
      defaultHandler: defaultHandler as any,
      authorizeEndpoint: "/authorize",
      tokenEndpoint: "/token",
      clientRegistrationEndpoint: "/register",
      resourceMetadata: { resource: env.MCP_RESOURCE },
    });
    return provider.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
