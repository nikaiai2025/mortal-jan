import { aggregate } from "./aggregate";
import { route } from "./api";

// Static assets are served before the Worker; only /api/* reaches fetch (wrangler.jsonc run_worker_first).
export default {
	async fetch(request, env, ctx): Promise<Response> {
		const response = await route(request, env, new URL(request.url), ctx);
		// _headers applies only to static assets, so API responses need their own headers.
		response.headers.set("X-Content-Type-Options", "nosniff");
		response.headers.set("X-Robots-Tag", "noindex");
		return response;
	},
	async scheduled(_controller, env, ctx): Promise<void> {
		ctx.waitUntil(aggregate(env.DB));
	},
} satisfies ExportedHandler<Env>;
