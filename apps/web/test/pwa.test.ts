import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detectPlatform } from "../src/lib/pwa";

const pub = (f: string) => new URL(`../public/${f}`, import.meta.url);

describe("PWA install platform", () => {
  it("detects iOS Safari, other iOS browsers, macOS Safari", () => {
    const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
    expect(detectPlatform(iphone, 5)).toBe("ios-safari");
    expect(detectPlatform(iphone.replace("Version/18.5", "CriOS/140.0"), 5)).toBe("ios-other");
    const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15";
    expect(detectPlatform(mac, 0)).toBe("mac-safari");
    expect(detectPlatform(mac, 5)).toBe("ios-safari"); // iPadOS desktop UA
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36", 0)).toBe("manual");
  });
});

describe("manifest", () => {
  const m = JSON.parse(readFileSync(pub("manifest.webmanifest"), "utf8"));
  it("has what install UIs need", () => {
    expect(m).toMatchObject({ id: "/", scope: "/", display: "standalone" });
    expect(m.start_url.startsWith("/")).toBe(true);
    const sizes = m.icons.map((i: any) => `${i.sizes}:${i.purpose}`);
    expect(sizes).toEqual(expect.arrayContaining(["192x192:any", "512x512:any", "192x192:maskable", "512x512:maskable"]));
    expect(m.screenshots.map((s: any) => s.form_factor).sort()).toEqual(["narrow", "wide"]);
  });
});

describe("service worker", () => {
  const sw = readFileSync(pub("sw.js"), "utf8");
  it("never intercepts API, MCP, OAuth or Cloudflare paths", () => {
    for (const p of ["api", "mcp", "authorize", "token", "register", "\\.well-known", "cdn-cgi"]) expect(sw).toContain(`/^\\/${p}`);
  });
  it("bypasses the card-secret endpoints and caches nothing else under /api", () => {
    const bypass: RegExp[] = eval(sw.match(/const BYPASS = (\[.*\]);/)![1]!);
    const skipped = (p: string) => bypass.some((re) => re.test(p));
    for (const p of ["/api/accounts/abc/secret", "/api/accounts/abc/secret/reveal", "/api/secrets/rotate", "/api/secrets/status", "/api", "/mcp", "/authorize", "/token", "/.well-known/oauth-authorization-server", "/cdn-cgi/access/authorized"])
      expect(skipped(p), p).toBe(true);
    for (const p of ["/", "/assets/index-abc.js", "/icons/icon-192.png", "/apiary"]) expect(skipped(p), p).toBe(false);
  });
});

describe("static security headers", () => {
  const headers = readFileSync(pub("_headers"), "utf8");
  it("protects the app against framing, MIME sniffing and insecure transport", () => {
    expect(headers).toContain("Content-Security-Policy:");
    expect(headers).toContain("frame-ancestors 'none'");
    expect(headers).toContain("Strict-Transport-Security: max-age=31536000");
    expect(headers).toContain("X-Content-Type-Options: nosniff");
    expect(headers).toContain("X-Frame-Options: DENY");
    expect(headers).toContain("Referrer-Policy: no-referrer");
  });

  it("keeps the offline fallback compatible with script-src self", () => {
    const offline = readFileSync(pub("offline.html"), "utf8");
    expect(offline).not.toMatch(/<script|\son\w+=/i);
    expect(offline).toContain('<a href="/">重试</a>');
  });
});
