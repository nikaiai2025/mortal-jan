import type { Plugin } from "vite";
import { PUBLIC_PAGES, seoHtml } from "./shared/site.ts";

/** Prebuild the public pages without adding Worker invocations or database reads. */
export function seoPages(): Plugin {
	return {
		name: "public-seo-pages",
		enforce: "post",
		transformIndexHtml: {
			order: "post",
			handler(html, context) {
				const path = context.server ? new URL(context.originalUrl ?? context.path, "http://localhost").pathname : "/";
				return seoHtml(html, path);
			},
		},
		generateBundle: {
			order: "post",
			handler(_, bundle) {
				if (this.environment.name !== "client") return;
				const index = bundle["index.html"];
				if (!index || index.type !== "asset" || typeof index.source !== "string") this.error("Missing built HTML for SEO pages");
				for (const path of Object.keys(PUBLIC_PAGES).filter((path) => path !== "/")) {
					this.emitFile({ type: "asset", fileName: `${path.slice(1)}.html`, source: seoHtml(index.source, path) });
				}
			},
		},
	};
}
