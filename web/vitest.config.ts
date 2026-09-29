import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		projects: [
			{ test: { name: "unit", include: ["shared/**/*.test.ts", "client/**/*.test.ts"] } },
			{
				plugins: [
					cloudflareTest(async () => ({
						main: "./worker/index.ts",
						wrangler: { configPath: "./wrangler.jsonc" },
						miniflare: {
							// The test runtime bundled with the pool lags behind wrangler's.
							compatibilityDate: "2026-08-22",
							bindings: { TEST_MIGRATIONS: await readD1Migrations("./migrations") },
						},
					})),
				],
				test: { name: "worker", include: ["worker/**/*.test.ts"] },
			},
		],
	},
});
