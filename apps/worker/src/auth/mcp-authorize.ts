/**
 * /authorize for the MCP OAuth flow (same pattern as the owner's pm app).
 *
 * This Worker is both the OAuth authorization server and the only resource (/mcp).
 * Signing in is Cloudflare Access: /authorize is NOT bypassed, so reaching it means the
 * edge already logged the owner in with GitHub. We still verify the Access JWT here
 * (same verifier, AUD and ALLOWED_EMAILS as /api), then only ask for consent and
 * complete the authorization with workers-oauth-provider. No upstream IdP, no /callback.
 */
import { AuthorizationError, CimdFetchError, type ConsentDescription, type OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import type { Env, McpProps } from "../env";
import { AuthError, verifyAccessRequest } from "./access-jwt";

export const MCP_SCOPE = "mcp";

type OAuthEnv = Env & { OAUTH_PROVIDER: OAuthHelpers };

const escape = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const STRINGS = {
  zh: {
    lang: "zh-CN",
    unnamed: "未命名应用",
    title: (n: string) => `允许 ${n} 访问 Bonus？`,
    publishedBy: (d: string) => `由 <strong>${d}</strong> 发布。`,
    selfRegistered: "这个应用是自行注册的，名字未经验证。",
    grants: (h: string) => `授权后它可以读取和修改你的账户、奖励与福利记录，凭证会发送到 <strong>${h}</strong>。`,
    loopback: "凭证会发给你电脑上的一个程序。只有在你刚刚从它发起登录时才继续。",
    signedInAs: (e: string) => `当前登录：${e}`,
    allow: "允许",
    deny: "拒绝",
    needLogin: "需要登录",
    needLoginBody: "请通过 Cloudflare Access 打开这个页面。",
    failed: "授权失败",
    failedRetry: "请回到 Claude 重新发起连接。",
    unverified: "无法验证这个应用。",
    invalid: "请求无效",
  },
  en: {
    lang: "en",
    unnamed: "Unnamed app",
    title: (n: string) => `Allow ${n} to access Bonus?`,
    publishedBy: (d: string) => `Published by <strong>${d}</strong>.`,
    selfRegistered: "This app registered itself; its name is not verified.",
    grants: (h: string) => `It will be able to read and change your accounts, bonuses and benefits. Access will be sent to <strong>${h}</strong>.`,
    loopback: "This sends access to an app on your computer. Continue only if you just started signing in from it.",
    signedInAs: (e: string) => `Signed in as ${e}`,
    allow: "Allow",
    deny: "Deny",
    needLogin: "Sign-in required",
    needLoginBody: "Open this page through Cloudflare Access.",
    failed: "Authorization failed",
    failedRetry: "Go back to Claude and connect again.",
    unverified: "This app could not be verified.",
    invalid: "Invalid request",
  },
};
type Strings = (typeof STRINGS)["en"];

/** Chinese when the browser prefers it, English otherwise. */
export function pickLang(request: Request): Strings {
  const first = (request.headers.get("Accept-Language") ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
  return first.startsWith("zh") ? STRINGS.zh : STRINGS.en;
}

function page(t: Strings, title: string, body: string, status = 200, headers = new Headers()) {
  headers.set("Content-Type", "text/html; charset=utf-8");
  return new Response(
    `<!doctype html><html lang="${t.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(title)}</title>
<style>
:root{--bg:#f8fafc;--card:#fff;--ink:#0f172a;--muted:#64748b;--line:#e2e8f0;--accent:#4f46e5}
@media(prefers-color-scheme:dark){:root{--bg:#020617;--card:#0f172a;--ink:#f1f5f9;--muted:#94a3b8;--line:#1e293b;--accent:#818cf8}}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 Inter,"PingFang SC","Noto Sans SC",system-ui,sans-serif}
main{max-width:420px;margin:12vh auto;padding:0 16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:24px}
h1{font-size:20px;margin:0 0 12px}p{margin:8px 0;color:var(--muted)}strong{color:var(--ink)}
.warn{color:#b45309}.who{font-size:13px}
.row{display:flex;gap:12px;margin-top:20px}
button{flex:1;height:48px;border-radius:12px;font:600 15px inherit;font-family:inherit;cursor:pointer}
.ok{background:var(--accent);color:#fff;border:0}.no{background:transparent;color:var(--ink);border:1px solid var(--line)}
</style></head><body><main><div class="card">${body}</div></main></body></html>`,
    { status, headers },
  );
}

function consentPage(t: Strings, d: ConsentDescription, handle: string, email: string) {
  const name = escape(d.clientName || t.unnamed);
  return `<h1>${t.title(name)}</h1>
<p>${d.clientDomain ? t.publishedBy(escape(d.clientDomain)) : t.selfRegistered}</p>
<p>${t.grants(escape(d.redirectHost))}</p>
${d.redirectIsLoopback ? `<p class="warn">${t.loopback}</p>` : ""}
<p class="who">${escape(t.signedInAs(email))}</p>
<form method="post">
<input type="hidden" name="handle" value="${escape(handle)}">
<div class="row"><button class="no" name="decision" value="deny">${t.deny}</button><button class="ok" name="decision" value="approve">${t.allow}</button></div>
</form>`;
}

/** GET/POST /authorize. Reached only through Cloudflare Access (or the localhost dev bypass). */
export async function handleAuthorize(request: Request, env: OAuthEnv): Promise<Response> {
  const t = pickLang(request);
  let email: string;
  try {
    email = (await verifyAccessRequest(request, env)).email;
  } catch (err) {
    const status = err instanceof AuthError ? err.status : 401;
    return page(t, t.needLogin, `<h1>${t.needLogin}</h1><p>${t.needLoginBody}</p>`, status);
  }
  const oauth = env.OAUTH_PROVIDER;
  try {
    if (request.method === "GET") {
      const authRequest = await oauth.parseAuthRequest(request);
      const details = await oauth.describeConsent(authRequest);
      const consent = await oauth.beginConsent(authRequest);
      return page(t, t.title(details.clientName || t.unnamed), consentPage(t, details, consent.handle, email), 200, consent.headers);
    }
    if (request.method === "POST") {
      const form = await request.formData();
      const handle = String(form.get("handle") ?? "");
      if (form.get("decision") !== "approve") {
        const denied = await oauth.denyConsent(request, handle);
        denied.headers.set("Location", denied.redirectTo);
        return new Response(null, { status: 302, headers: denied.headers });
      }
      const approved = await oauth.approveConsent(request, handle, { scope: [MCP_SCOPE] });
      const props: McpProps = { email };
      const { redirectTo } = await oauth.completeAuthorization({
        request: approved.request,
        userId: email,
        metadata: { label: email },
        scope: approved.request.scope,
        props,
      });
      approved.headers.set("Location", redirectTo);
      return new Response(null, { status: 302, headers: approved.headers });
    }
    return new Response(null, { status: 405, headers: { Allow: "GET, POST" } });
  } catch (error) {
    if (error instanceof AuthorizationError && error.redirectTo) return Response.redirect(error.redirectTo, 302);
    if (error instanceof AuthorizationError || error instanceof CimdFetchError) {
      const message = error instanceof AuthorizationError ? error.description : t.unverified;
      return page(t, t.failed, `<h1>${t.failed}</h1><p>${escape(message ?? t.invalid)}</p><p>${t.failedRetry}</p>`, 400);
    }
    throw error;
  }
}
