import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";

export interface Env {
  DB: D1Database;
  OAUTH_KV: KVNamespace;
  ASSETS: Fetcher;

  /** URL MCP clients connect to; OAuth tokens are bound to it. */
  MCP_RESOURCE: string;

  /** Cloudflare Access team domain, e.g. https://myteam.cloudflareaccess.com (secret/var). */
  ACCESS_TEAM_DOMAIN?: string;
  /** Application Audience (AUD) tag of the self-hosted Access application. */
  ACCESS_AUD?: string;
  /** Optional comma-separated allowlist of emails (defense in depth on top of Access policies). */
  ALLOWED_EMAILS?: string;

  /** Access for SaaS (OIDC) app used as the upstream IdP for MCP OAuth. */
  ACCESS_CLIENT_ID?: string;
  ACCESS_CLIENT_SECRET?: string;
  ACCESS_TOKEN_URL?: string;
  ACCESS_AUTHORIZATION_URL?: string;
  ACCESS_JWKS_URL?: string;
  COOKIE_ENCRYPTION_KEY?: string;

  /**
   * Local development only: identity used when the request host is localhost.
   * Ignored for any other hostname.
   */
  DEV_USER_EMAIL?: string;

  OAUTH_PROVIDER?: OAuthHelpers;
}

/** Props stored in the MCP OAuth grant (available via getMcpAuthContext()). */
export interface McpProps extends Record<string, unknown> {
  email: string;
  name?: string;
  sub?: string;
}
