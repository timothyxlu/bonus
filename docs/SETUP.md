# Setup: things only the owner can do

Everything in the repo deploys automatically from `main`, but a few things live in the
Cloudflare / GitHub dashboards and need your account. Do them **in this order**.

> Values in `<angle brackets>` are yours. Nothing on this page should ever be committed.

## 0. Overview

| Piece | Where | Purpose |
| --- | --- | --- |
| API token + account ID | GitHub repo secrets | CI deploys the Worker, creates D1/KV, runs migrations |
| GitHub login method | Zero Trust → Settings → Authentication | Lets you sign in to Access with GitHub |
| Access app "bonus" (self-hosted) | Zero Trust → Access → Applications | Protects the web UI, `/api` **and `/authorize`** (MCP sign-in) |
| Access app "bonus-public" (bypass) | Zero Trust → Access → Applications | Lets MCP clients reach `/mcp`, `/token`, `/register`, `/.well-known` (protected by the Worker's own OAuth) |
| Worker secrets | `wrangler secret put` or dashboard | Access JWT verification |

How MCP sign-in works: Claude opens `https://bonus.timothyxlu.xyz/authorize`. That path is behind the
main Access app, so you log in with GitHub there; the Worker verifies the Access JWT (same AUD and
`ALLOWED_EMAILS` as `/api`), shows an "Allow … to access Bonus?" page, and issues an OAuth token bound
to your email. There is no separate OIDC / Access for SaaS app and no `/callback`.

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

## 3. Access application for the web UI, API and MCP sign-in

Zero Trust → **Access → Applications → Add an application → Self-hosted**:

- Application name: `bonus`
- Session duration: e.g. `1 month`
- Public hostname: subdomain `bonus`, domain `timothyxlu.xyz`, path *(empty = whole site)*
- Login methods: **GitHub only**; enable **Instant Auth** (skip the IdP picker)
- Policy: name `Owner`, action **Allow**, Include → **Emails** → `<your GitHub primary email>`
- Save. Open the application again → **Overview** → copy the **Application Audience (AUD) Tag**.

This app also covers `/authorize` — do **not** bypass it. The Worker re-verifies the
`Cf-Access-Jwt-Assertion` JWT (signature, issuer, AUD, expiry, optional `ALLOWED_EMAILS`) on every
`/api` and `/authorize` request, so a request that somehow skips the edge is still rejected.

## 4. Bypass Access for the MCP endpoints

MCP clients (Claude.ai, Claude Code) call these paths from their servers or CLI without an Access
session. They are protected by the Worker's own OAuth server (tokens are only issued after the
Access-protected `/authorize` consent), so Access must let them through.

Zero Trust → **Access → Applications → Add an application → Self-hosted**:

- Application name: `bonus-public`
- Add one **public hostname** per path, all on `bonus.timothyxlu.xyz`:
  - path `mcp`
  - path `token`
  - path `register`
  - path `.well-known`
- Policy: name `Bypass`, action **Bypass**, Include → **Everyone**.
- Save. (Access matches the most specific path first, so these win over the `bonus` app;
  a path also covers its sub-paths, e.g. `.well-known/oauth-protected-resource/mcp`.)
  Do **not** add `authorize` here.

## 5. First deploy

Merge the PR (or run the **Deploy** workflow manually). The workflow:

1. runs typecheck, build and tests,
2. finds or creates the D1 database `bonus` and the KV namespace `bonus-oauth`,
3. applies D1 migrations,
4. deploys the Worker with the custom domain `bonus.timothyxlu.xyz`.

If the secrets from step 1 are missing, the deploy steps are skipped with a warning.

## 6. Worker secrets

After the first deploy (the Worker must exist), set these — either in the dashboard
(**Workers & Pages → bonus → Settings → Variables and Secrets → Add → Secret**) or from a
checkout with `cd apps/worker && npx wrangler secret put <NAME>`:

| Secret | Value |
| --- | --- |
| `ACCESS_TEAM_DOMAIN` | `https://<your-team>.cloudflareaccess.com` |
| `ACCESS_AUD` | AUD tag of the `bonus` app from step 3 |
| `ALLOWED_EMAILS` | *(optional, recommended)* your email; comma-separated list. Checked by the Worker for `/api` and `/authorize`, on top of the Access policy |
| `CARD_ENCRYPTION_KEY` | Encryption key for card / gift-card secrets (see below). Without a valid key the feature is disabled (never plaintext) |

### Card secret encryption key (`CARD_ENCRYPTION_KEY`)

Full card numbers, expiry, CVV and gift-card numbers / PINs are encrypted in D1 with AES-256-GCM.
The key must be **32 random bytes, base64-encoded**:

```sh
openssl rand -base64 32          # prints the key; copy it, don't save it in a file in the repo
cd apps/worker && npx wrangler secret put CARD_ENCRYPTION_KEY   # paste when prompted
```

Or in the dashboard: Workers & Pages → bonus → Settings → Variables and Secrets → Add → type **Secret**.
If the value is missing or does not decode to exactly 32 bytes, the 卡片信息 section shows "key missing / invalid"
and nothing can be saved or revealed.

**Back up the key** (e.g. in your password manager). Values encrypted with a lost key cannot be recovered.

**Rotating the key**

1. Generate a new key (`openssl rand -base64 32`).
2. Keep the old one readable: set secret `CARD_ENCRYPTION_KEYS_OLD` = `k1:<old key>` (comma-separate several `id:key` pairs).
3. Set secret `CARD_ENCRYPTION_KEY` = the new key and secret/var `CARD_ENCRYPTION_KEY_ID` = `k2` (any new id; the first key's id is `k1`).
4. While signed in to the app, call `POST /api/secrets/rotate` (e.g. from the browser devtools console:
   `fetch("/api/secrets/rotate", { method: "POST" }).then(r => r.json())`). It re-encrypts everything with `k2`.
5. Remove `CARD_ENCRYPTION_KEYS_OLD`.

Secrets take effect immediately; no redeploy needed.

## 7. Check it

1. Open `https://bonus.timothyxlu.xyz` → GitHub login → the dashboard loads.
2. `curl -i https://bonus.timothyxlu.xyz/api/accounts` (no cookie) → redirected to Access login (edge) — and the Worker would return 401 anyway.
3. `curl -i https://bonus.timothyxlu.xyz/mcp -X POST` → `401` with `WWW-Authenticate: Bearer` (OAuth, not an Access login page).
4. `curl -i https://bonus.timothyxlu.xyz/authorize` → redirected to the Access login (it must NOT be bypassed).
5. `curl https://bonus.timothyxlu.xyz/.well-known/oauth-authorization-server` → JSON metadata.

## 8. Connect Claude

- **Claude.ai**: Settings → Connectors → **Add custom connector** → URL `https://bonus.timothyxlu.xyz/mcp`
  → Connect → GitHub login via Access (if not already signed in) → **允许 / Allow**.
- **Claude Code**: `claude mcp add --transport http bonus https://bonus.timothyxlu.xyz/mcp`, then run `/mcp`
  inside Claude Code and choose *Authenticate*.

## 9. Import your real history

Use **设置 → 导入历史** in the web app (JSON or CSV, see [IMPORT.md](IMPORT.md)), or the
`add_account` / `record_event` MCP tools. Real data never goes through git.


## 10. Install the app

See [PWA.md](PWA.md): iPhone (Safari → 分享 → 添加到主屏幕), Android and desktop Chrome/Edge (设置 → 安装 App). No Access change is needed.
