import { expect, it } from "vitest";
import { PUBLIC_PAGES, SITE_URL, pageMeta, publicContent, seoHtml } from "./site";

const template = '<html><head><!-- site-meta --><!-- /site-meta --><meta name="google-site-verification" content="verification" /></head><body><!-- static-page --><!-- /static-page --><script src="/assets/app.js"></script></body></html>';

it.each(["/q/12", "/sets/all/2", "/u/me", "/u/abc123", "/recover", "/missing", "/q/<script>"])("keeps personalized or unavailable page %s out of search", (path) => {
	expect(pageMeta(path)).toMatchObject({ noindex: true, canonical: null });
	const html = seoHtml(template, path);
	expect(html).toContain('<meta name="robots" content="noindex" />');
	expect(html).not.toContain('rel="canonical"');
});

it("keeps public pages discoverable with distinct titles and canonical URLs", () => {
	expect(new Set(Object.values(PUBLIC_PAGES).map((page) => page.title)).size).toBe(Object.keys(PUBLIC_PAGES).length);
	for (const path of Object.keys(PUBLIC_PAGES)) {
		expect(pageMeta(path)).toMatchObject({ noindex: false, canonical: SITE_URL + path });
		expect(seoHtml(template, path)).not.toContain('name="robots"');
	}
});

it.each(Object.keys(PUBLIC_PAGES) as (keyof typeof PUBLIC_PAGES)[])("renders useful initial HTML for %s", (path) => {
	const html = seoHtml(template, path);
	const main = /<main class="sheet">([\s\S]*?)<\/main>/.exec(html)?.[1];
	expect(main).toContain(publicContent(path));
	expect(main).toMatch(/<h1>[^<]+<\/h1>/);
	expect(main).not.toContain('class="loading"');
});

it("does not canonicalize the shared SPA fallback to the home page", () => {
	const html = seoHtml(template, "/");
	expect(html).not.toContain('rel="canonical"');
	expect(html).toContain('"@type":"WebSite"');
	expect(html).toContain('href="/rules"');
	expect(html).toContain('href="/about"');
});

it.each(["/about", "/rules"] as const)("serves the full %s text without JavaScript and preserves required assets", (path) => {
	const html = seoHtml(seoHtml(template, "/"), path);
	expect(html).toContain(publicContent(path));
	expect(html).toContain(`href="${SITE_URL}${path}"`);
	expect(html).toContain('name="google-site-verification" content="verification"');
	expect(html).toContain('src="/assets/app.js"');
	expect(html).not.toContain('"@type":"WebSite"');
	expect(html.match(/<title>/g)).toHaveLength(1);
	expect(html.match(/id="static-page"/g)).toHaveLength(1);
});

it("publishes the model limitation and does not embed answers, sessions, or replay data", () => {
	const html = seoHtml(template, "/about") + seoHtml(template, "/rules");
	expect(html).toContain("公式モデルではありません");
	expect(html).not.toMatch(/Bearer|\/api\/|q_values|candidateScores|playerToken|\/problem-logs/);
});
