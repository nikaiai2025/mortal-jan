/** First-touch acquisition. Never retain arbitrary URLs, query strings, or referrer hosts. */
export const VISITOR_HEADER = "X-Mortal-Visitor";
export const VISITOR_ID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export const DAY_MS = 86_400_000;

export interface Acquisition {
	source: string;
	medium: string;
	campaign: string;
	content: string;
	landing: string;
}

const SOURCES = ["x", "google", "bing", "duckduckgo", "instagram", "youtube", "facebook", "threads", "bluesky", "other", "unknown"];
const MEDIA = ["organic", "organic_social", "referral", "unknown"];
const label = (value: unknown): string => typeof value === "string" && /^[a-z0-9][a-z0-9_-]{0,47}$/.test(value) ? value : "";

export function landingGroup(path: unknown): string {
	if (typeof path !== "string") return "other";
	if (["/", "/daily", "/sets", "/ranking", "/about", "/rules", "/q/*", "/sets/*"].includes(path)) return path;
	if (/^\/q\/[1-9]\d*$/.test(path)) return "/q/*";
	if (/^\/sets\/(all|easy|normal|hard|discard|riichi|call)\/[1-9]\d*$/.test(path)) return "/sets/*";
	return "other";
}

/** Shared allowlist also bounds the public collector's cardinality. */
export function normalizeAcquisition(value: Record<string, unknown>): Acquisition {
	return {
		source: SOURCES.includes(String(value.source)) ? String(value.source) : "unknown",
		medium: MEDIA.includes(String(value.medium)) ? String(value.medium) : "unknown",
		campaign: label(value.campaign), content: label(value.content), landing: landingGroup(value.landing),
	};
}

export function acquisitionFromUrl(url: URL, referrer: string): Acquisition {
	const source = url.searchParams.get("utm_source")?.toLowerCase();
	if (source && SOURCES.includes(source === "twitter" ? "x" : source)) {
		return normalizeAcquisition({
			source: source === "twitter" ? "x" : source,
			medium: url.searchParams.get("utm_medium"), campaign: url.searchParams.get("utm_campaign"),
			content: url.searchParams.get("utm_content"), landing: url.pathname,
		});
	}
	let host = "";
	try { const referring = new URL(referrer); if (referring.origin !== url.origin) host = referring.hostname.toLowerCase(); } catch { /* missing referrer */ }
	const is = (domain: string) => host === domain || host.endsWith(`.${domain}`);
	let detected = "unknown";
	if (/^(www\.)?google\.(com|co\.jp)$/.test(host)) detected = "google";
	else if (is("bing.com")) detected = "bing";
	else if (is("duckduckgo.com")) detected = "duckduckgo";
	else if (is("t.co") || is("x.com") || is("twitter.com")) detected = "x";
	else if (is("instagram.com")) detected = "instagram";
	else if (is("youtube.com") || is("youtu.be")) detected = "youtube";
	else if (is("facebook.com")) detected = "facebook";
	else if (is("threads.net") || is("threads.com")) detected = "threads";
	else if (is("bsky.app")) detected = "bluesky";
	else if (host) detected = "other";
	return normalizeAcquisition({ source: detected, medium: ["google", "bing", "duckduckgo"].includes(detected) ? "organic" : detected === "unknown" ? "unknown" : "referral", landing: url.pathname });
}
