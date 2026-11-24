import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { getDb } from "../src/db/client";
import * as preferences from "../src/services/preferences";

const call = async (method: string, path: string, body?: unknown) => {
  const res = await (exports as any).default.fetch(
    new Request(`http://localhost/api${path}`, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : {},
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, cacheControl: res.headers.get("Cache-Control") };
};

describe("user preferences: home state", () => {
  it("defaults to not set, then persists, replaces and clears the state", async () => {
    const initial = await call("GET", "/preferences");
    expect(initial.status).toBe(200);
    expect(initial.body).toEqual({ homeState: null, updatedAt: null });
    expect(initial.cacheControl).toBe("no-store");

    const set = await call("PATCH", "/preferences", { homeState: "CA" });
    expect(set.status).toBe(200);
    expect(set.body.homeState).toBe("CA");
    expect(set.body.updatedAt).toEqual(expect.any(String));
    // A fresh read (another device / after reload) sees the stored value.
    expect((await call("GET", "/preferences")).body.homeState).toBe("CA");

    expect((await call("PATCH", "/preferences", { homeState: "DC" })).body.homeState).toBe("DC");
    expect((await call("GET", "/preferences")).body.homeState).toBe("DC");

    const cleared = await call("PATCH", "/preferences", { homeState: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.homeState).toBeNull();
    expect((await call("GET", "/preferences")).body.homeState).toBeNull();
  });

  it("accepts every one of the 50 states and DC", async () => {
    const { US_STATE_CODES } = await import("@bonus/core");
    for (const code of US_STATE_CODES) expect((await call("PATCH", "/preferences", { homeState: code })).body.homeState).toBe(code);
  });

  it("rejects invalid values without changing the stored state", async () => {
    await call("PATCH", "/preferences", { homeState: "NY" });
    for (const bad of [
      { homeState: "ny" },
      { homeState: "PR" },
      { homeState: "New York" },
      { homeState: "" },
      { homeState: 12 },
      {},
      { homeState: "NY", extra: true },
    ]) {
      const res = await call("PATCH", "/preferences", bad);
      expect(res.status, JSON.stringify(bad)).toBe(400);
      expect(res.body.error).toEqual(expect.any(String));
    }
    expect((await call("PATCH", "/preferences", "not json")).status).toBe(400);
    expect((await call("GET", "/preferences")).body.homeState).toBe("NY");
  });

  it("scopes preferences to the authenticated owner", async () => {
    await call("PATCH", "/preferences", { homeState: "TX" });
    const other = { db: getDb((env as any).DB), ownerId: "someone-else@example.com", today: "2026-11-24" };
    expect((await preferences.getPreferences(other)).homeState).toBeNull();
    await preferences.updatePreferences(other, { homeState: "WA" });
    expect((await call("GET", "/preferences")).body.homeState).toBe("TX");
    expect((await preferences.getPreferences(other)).homeState).toBe("WA");
  });

  it("enforces canonical codes at the database level too", async () => {
    const db = (env as any).DB as D1Database;
    await expect(db.prepare("INSERT INTO user_preferences (owner_id, home_state) VALUES (?, ?)").bind("raw@example.com", "ca").run()).rejects.toThrow();
  });
});
