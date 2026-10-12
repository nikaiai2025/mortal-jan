/** UI preference only: it never changes player identity, answers or analytics consent. */
export type Locale = "ja" | "en";
export const LOCALE_KEY = "mortal-jan.locale";
let locale: Locale = "ja";

export function getLocale(): Locale { return locale; }
export function t(ja: string, en: string): string { return locale === "en" ? en : ja; }

export function initialLocale(search = "", storage?: Pick<Storage, "getItem">): Locale {
	const requested = new URLSearchParams(search).get("lang");
	if (requested === "ja" || requested === "en") return requested;
	try { return storage?.getItem(LOCALE_KEY) === "en" ? "en" : "ja"; }
	catch { return "ja"; }
}

/** Explicit links take priority; otherwise keep the browser's last choice. */
export function setLocale(value: Locale, storage?: Pick<Storage, "setItem">): void {
	locale = value;
	try { storage?.setItem(LOCALE_KEY, value); } catch { /* works in memory without storage */ }
	if (typeof document !== "undefined") document.documentElement.lang = value;
}

export function localePath(path: string): string {
	const url = new URL(path, "https://local.invalid");
	if (locale === "en") url.searchParams.set("lang", "en");
	else url.searchParams.delete("lang");
	return url.pathname + url.search + url.hash;
}
