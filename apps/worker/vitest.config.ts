import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(path.join(__dirname, "migrations")),
          DEV_USER_EMAIL: "tester@example.com",
          ACCESS_TEAM_DOMAIN: "https://example-team.cloudflareaccess.com",
          ACCESS_AUD: "test-aud",
          MCP_RESOURCE: "http://localhost/mcp",
          // Test-only key (32 bytes of 0x2a), not used anywhere else.
          CARD_ENCRYPTION_KEY: btoa(String.fromCharCode(...new Array(32).fill(42))),
        },
      },
    })),
  ],
  test: {
    setupFiles: ["./test/setup.ts"],
  },
});
