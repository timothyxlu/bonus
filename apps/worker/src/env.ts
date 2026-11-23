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
  /** Optional comma-separated allowlist of emails, checked for /api and /authorize (on top of Access policies). */
  ALLOWED_EMAILS?: string;

  /**
   * Local development only: identity used when the request host is localhost.
   * Ignored for any other hostname.
   */
  DEV_USER_EMAIL?: string;

  OAUTH_PROVIDER?: OAuthHelpers;
}

/** Props stored in the MCP OAuth grant (available via getMcpAuthContext()). */
export interface McpProps extends Record<string, unknown> {
  /** Owner email from the Cloudflare Access identity that approved the client. */
  email: string;
}
