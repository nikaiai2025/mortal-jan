import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import { seoPages } from "./seo-plugin.ts";

export default defineConfig({
	// Tile images are served from the repository-wide assets directory (/tiles/*.svg).
	publicDir: "../assets",
	plugins: [cloudflare(), seoPages()],
});
