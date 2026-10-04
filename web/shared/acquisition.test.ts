import { describe, expect, it } from "vitest";
import { acquisitionFromUrl, landingGroup, normalizeAcquisition } from "./acquisition";

describe("safe first-touch labels", () => {
	it("uses explicit post labels, without storing unrelated query data or profile IDs", () => {
		const a = acquisitionFromUrl(new URL("https://example.com/q/12?utm_source=twitter&utm_medium=organic_social&utm_campaign=first-trial&utm_content=post-01&from=private-id"), "https://private.example/path?secret=1");
		expect(a).toEqual({ source: "x", medium: "organic_social", campaign: "first-trial", content: "post-01", landing: "/q/*" });
		expect(landingGroup("/u/private-id")).toBe("other");
		expect(landingGroup("/recover")).toBe("other");
		expect(normalizeAcquisition({ ...a })).toEqual(a);
	});
	it("classifies genuine referring domains, retaining unknown when referrer is missing", () => {
		const url = new URL("https://example.com/about");
		expect(acquisitionFromUrl(url, "https://www.google.co.jp/search?q=secret").source).toBe("google");
		expect(acquisitionFromUrl(url, "https://t.co/abc").source).toBe("x");
		expect(acquisitionFromUrl(url, "https://x.com.attacker.test/path").source).toBe("other");
		expect(acquisitionFromUrl(url, "https://example.com/rules").source).toBe("unknown");
		expect(acquisitionFromUrl(url, "").medium).toBe("unknown");
	});
	it("bounds labels and rejects raw URLs and arbitrary strings", () => {
		expect(normalizeAcquisition({ source: "private-site", medium: "invalid", campaign: "https://private/path", content: "a".repeat(49), landing: "/q/2?secret=1" })).toEqual({ source: "unknown", medium: "unknown", campaign: "", content: "", landing: "other" });
	});
});
