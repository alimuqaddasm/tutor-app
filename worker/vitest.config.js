import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrations = await readD1Migrations("./migrations");
  return {
    plugins: [cloudflareTest({
      wrangler: { configPath: "./wrangler.toml" },
      miniflare: { bindings: { TEACHER_PASSWORD: "test-password", LOADER_KEY: "loader-key-for-tests-0123456789abcdef", TEST_MIGRATIONS: migrations } }
    })],
    test: { setupFiles: ["./test/apply-migrations.js"] }
  };
});
