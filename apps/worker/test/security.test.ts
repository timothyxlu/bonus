import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { benefitInput, benefitPatch, offerInput, offerPatch } from "../src/schemas";

const worker = (exports as any).default;

describe("security hardening", () => {
  it("adds browser security headers to successful and rejected Worker responses", async () => {
    for (const request of [new Request("http://localhost/api/health"), new Request("https://bonus.example.com/api/accounts")]) {
      const response = await worker.fetch(request, env);
      expect(response.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
      expect(response.headers.get("Strict-Transport-Security")).toContain("max-age=31536000");
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(response.headers.get("X-Frame-Options")).toBe("DENY");
      expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
      expect(response.headers.get("Permissions-Policy")).toContain("camera=()");
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    }
  });

  it("only accepts http(s) source URLs in every source URL schema", () => {
    const benefit = { name: "Credit", period: "annual" as const, sourceUrl: "https://example.com/terms" };
    const offer = { kind: "bank_account" as const, institutionId: "chase", title: "Offer", rewardAmount: 1, sourceUrl: "http://example.com/offer" };
    expect(benefitInput.safeParse(benefit).success).toBe(true);
    expect(offerInput.safeParse(offer).success).toBe(true);

    for (const unsafe of ["javascript:alert(1)", "data:text/html,test", "file:///tmp/card", "ftp://example.com/file"]) {
      expect(benefitInput.safeParse({ ...benefit, sourceUrl: unsafe }).success, unsafe).toBe(false);
      expect(benefitPatch.safeParse({ sourceUrl: unsafe }).success, unsafe).toBe(false);
      expect(offerInput.safeParse({ ...offer, sourceUrl: unsafe }).success, unsafe).toBe(false);
      expect(offerPatch.safeParse({ sourceUrl: unsafe }).success, unsafe).toBe(false);
    }
  });
});
