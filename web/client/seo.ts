import { getLocale, t } from "./i18n";
import { EN_SITE_NAME } from "../shared/site-en";
import { SITE_NAME, pageMeta } from "../shared/site";

/** Keep metadata correct after in-app links, back/forward, and profile URL replacement. */
export function updatePageMeta(path: string): void {
	const page = pageMeta(path, getLocale());
	document.title = page.title;
	for (const [selector, value] of [
		['meta[name="description"]', page.description],
		['meta[property="og:locale"]', getLocale() === "en" ? "en_US" : "ja_JP"],
		['meta[property="og:site_name"]', t(SITE_NAME, EN_SITE_NAME)],
		['meta[property="og:title"]', page.title],
		['meta[property="og:description"]', page.description],
		['meta[property="og:url"]', page.canonical ?? location.origin + path],
	] as const) document.querySelector<HTMLMetaElement>(selector)?.setAttribute("content", value);
	let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
	if (page.canonical) {
		if (!canonical) { canonical = document.createElement("link"); canonical.rel = "canonical"; document.head.append(canonical); }
		canonical.href = page.canonical;
	} else canonical?.remove();
	let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
	if (page.noindex) {
		if (!robots) { robots = document.createElement("meta"); robots.name = "robots"; document.head.append(robots); }
		robots.content = "noindex";
	} else robots?.remove();
}
