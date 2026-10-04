import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { normalizeAcquisition, landingGroup } from "../../web/shared/acquisition.ts";

export function campaignLink({ url, source, campaign, content }) {
	const link = new URL(url);
	if (link.origin !== "https://mortal-jan.shika.workers.dev" || landingGroup(link.pathname) === "other") throw new Error("公開サイトの出題・紹介ページのURLを指定してください。");
	const a = normalizeAcquisition({ source, medium: "organic_social", campaign, content });
	if (a.source === "unknown" || !a.campaign || !a.content) throw new Error("流入元と、英小文字・数字・ハイフン・アンダースコアの試行名と投稿名（各48字以内）を指定してください。");
	for (const key of [...link.searchParams.keys()]) if (key.startsWith("utm_")) link.searchParams.delete(key);
	link.searchParams.set("utm_source", a.source);
	link.searchParams.set("utm_medium", a.medium);
	link.searchParams.set("utm_campaign", a.campaign);
	link.searchParams.set("utm_content", a.content);
	return link.href;
}

function main() {
	const args = process.argv.slice(2);
	if (args.includes("--help")) { console.log("node tools/acquisition/link.mjs --url 公開URL --source x --campaign first-trial --content post-01"); return; }
	const values = {};
	for (let i = 0; i < args.length; i += 2) {
		const key = args[i].replace(/^--/, "");
		if (!["url", "source", "campaign", "content"].includes(key) || values[key] || !args[i + 1]) throw new Error("引数が不正です。--help で使い方を確認してください。");
		values[key] = args[i + 1];
	}
	console.log(campaignLink(values));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
