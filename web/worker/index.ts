import { aggregate } from "./aggregate";
import { route } from "./api";

// Static assets are served before the Worker; only /api/* reaches fetch (wrangler.jsonc run_worker_first).
export default {
	async fetch(request, env): Promise<Response> {
		return route(request, env, new URL(request.url));
	},
	async scheduled(_controller, env, ctx): Promise<void> {
		ctx.waitUntil(aggregate(env.DB));
	},
} satisfies ExportedHandler<Env>;
