# Setup: things only the owner can do

Everything in the repo deploys automatically from `main`, but a few things live in the
Cloudflare / GitHub dashboards and need your account. Do them **in this order**.

> Values in `<angle brackets>` are yours. Nothing on this page should ever be committed.

## 0. Overview

| Piece | Where | Purpose |
| --- | --- | --- |
| API token + account ID | GitHub repo secrets | CI deploys the Worker, creates D1/KV, runs migrations |
| GitHub login method | Zero Trust → Settings → Authentication | Lets you sign in to Access with GitHub |
| Access app "Bonus" (self-hosted) | Zero Trust → Access → Applications | Protects the web UI and `/api` |
| Access app "Bonus OAuth bypass" | Zero Trust → Access → Applications | Lets MCP clients reach `/mcp` and the OAuth endpoints (they have their own OAuth) |
| Access for SaaS app "Bonus MCP" (OIDC) | Zero Trust → Access → Applications | Upstream login for the MCP OAuth flow |
| Worker secrets | `wrangler secret put` or dashboard | Access JWT verification + MCP OAuth configuration |

## 1. Cloudflare API token and GitHub secrets

1. Cloudflare dashboard → **My Profile → API Tokens → Create Token → Create Custom Token**.
2. Name: `bonus-github-deploy`. Permissions:
   - Account · **Workers Scripts** · Edit
   - Account · **D1** · Edit
   - Account · **Workers KV Storage** · Edit
   - Account · **Account Settings** · Read
   - Zone · **Workers Routes** · Edit
   - Zone · **DNS** · Edit (needed to create the `bonus` custom-domain record)
   - Zone · **Zone** · Read
3. Account resources: *Include → your account*. Zone resources: *Include → Specific zone → timothyxlu.xyz*.
4. Create the token and copy it (shown once).
5. Copy your **Account ID** (dashboard home → right sidebar, or Workers & Pages overview).
6. GitHub → `timothyxlu/bonus` → **Settings → Secrets and variables → Actions → New repository secret**:
   - `CLOUDFLARE_API_TOKEN` = the token
   - `CLOUDFLARE_ACCOUNT_ID` = the account ID

## 2. GitHub as an Access login method

1. GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**:
   - Application name: `Cloudflare Access (bonus)`
   - Homepage URL: `https://<your-team>.cloudflareaccess.com`
   - Authorization callback URL: `https://<your-team>.cloudflareaccess.com/cdn-cgi/access/callback`
   - Register, then **Generate a new client secret**. Copy Client ID and secret.
   (Your team name is under Zero Trust → Settings → Custom Pages / "Team domain".)
2. Cloudflare **Zero Trust → Settings → Authentication → Login methods → Add new → GitHub**.
   Paste the Client ID / secret, save, then click **Test** — it should show your GitHub email.

## 3. Access application for the web UI and API

Zero Trust → **Access → Applications → Add an application → Self-hosted**:

- Application name: `Bonus`
- Session duration: e.g. `1 month`
- Public hostname: subdomain `bonus`, domain `timothyxlu.xyz`, path *(empty = whole site)*
- Identity providers: **GitHub only**; enable **Instant Auth** (skip the IdP picker)
- Policy: name `Owner`, action **Allow**, Include → **Emails** → `<your GitHub primary email>`
- Save. Open the application again → **Overview** → copy the **Application Audience (AUD) Tag**.

The Worker re-verifies the `Cf-Access-Jwt-Assertion` JWT (signature, issuer, AUD, expiry) on every
`/api` request, so a request that somehow skips the edge is still rejected.

## 4. Bypass Access for the MCP and OAuth endpoints

MCP clients (Claude.ai, Claude Code) cannot complete an interactive Access login on `/mcp`.
Those paths are protected by the Worker's own OAuth server instead (step 5), so Access must let
them through.

Zero Trust → **Access → Applications → Add an application → Self-hosted**:

- Application name: `Bonus OAuth bypass`
- Add one **public hostname** per path, all on `bonus.timothyxlu.xyz`:
  - path `mcp`
  - path `authorize`
  - path `callback`
  - path `token`
  - path `register`
  - path `.well-known`
- Policy: name `Bypass`, action **Bypass**, Include → **Everyone**.
- Save. (Access matches the most specific path first, so these win over the `Bonus` app;
  a path also covers its sub-paths, e.g. `.well-known/oauth-protected-resource/mcp`.)

## 5. Access for SaaS (OIDC) app for MCP login

Zero Trust → **Access → Applications → Add an application → SaaS**:

- Application: type `Bonus MCP`, choose **OIDC**
- Redirect URLs: `https://bonus.timothyxlu.xyz/callback`
  (add `http://localhost:8787/callback` too if you want to test MCP OAuth locally)
- Scopes: `openid`, `email`, `profile`
- Enable **PKCE** if shown
- Identity providers: **GitHub**; policy: same `Owner` allow policy as step 3
- Save, then copy from the app's configuration page:
  **Client ID**, **Client secret**, **Authorization endpoint**, **Token endpoint**, **Key endpoint** (JWKS)

## 6. First deploy

Merge the PR (or run the **Deploy** workflow manually). The workflow:

1. runs typecheck, build and tests,
2. finds or creates the D1 database `bonus` and the KV namespace `bonus-oauth`,
3. applies D1 migrations,
4. deploys the Worker with the custom domain `bonus.timothyxlu.xyz`.

If the secrets from step 1 are missing, the deploy steps are skipped with a warning.

## 7. Worker secrets

After the first deploy (the Worker must exist), set these — either in the dashboard
(**Workers & Pages → bonus → Settings → Variables and Secrets → Add → Secret**) or from a
checkout with `cd apps/worker && npx wrangler secret put <NAME>`:

| Secret | Value |
| --- | --- |
| `ACCESS_TEAM_DOMAIN` | `https://<your-team>.cloudflareaccess.com` |
| `ACCESS_AUD` | AUD tag from step 3 |
| `ACCESS_CLIENT_ID` | Client ID from step 5 |
| `ACCESS_CLIENT_SECRET` | Client secret from step 5 |
| `ACCESS_AUTHORIZATION_URL` | Authorization endpoint from step 5 |
| `ACCESS_TOKEN_URL` | Token endpoint from step 5 |
| `ACCESS_JWKS_URL` | Key endpoint from step 5 |
| `COOKIE_ENCRYPTION_KEY` | output of `openssl rand -hex 32` |
| `ALLOWED_EMAILS` | *(optional, recommended)* your email; comma-separated list. Checked by the Worker for both the web UI and MCP, on top of the Access policies |

Secrets take effect immediately; no redeploy needed.

## 8. Check it

1. Open `https://bonus.timothyxlu.xyz` → GitHub login → the dashboard loads.
2. `curl -i https://bonus.timothyxlu.xyz/api/accounts` (no cookie) → redirected to Access login (edge) — and the Worker would return 401 anyway.
3. `curl -i https://bonus.timothyxlu.xyz/mcp -X POST` → `401` with `WWW-Authenticate: Bearer` (OAuth, not an Access login page).
4. `curl https://bonus.timothyxlu.xyz/.well-known/oauth-authorization-server` → JSON metadata.

## 9. Connect Claude

- **Claude.ai**: Settings → Connectors → **Add custom connector** → URL `https://bonus.timothyxlu.xyz/mcp`
  → Connect → approve → GitHub login via Access.
- **Claude Code**: `claude mcp add --transport http bonus https://bonus.timothyxlu.xyz/mcp`, then run `/mcp`
  inside Claude Code and choose *Authenticate*.

## 10. Import your real history

Use **设置 → 导入历史** in the web app (JSON or CSV, see [IMPORT.md](IMPORT.md)), or the
`add_account` / `record_event` MCP tools. Real data never goes through git.
