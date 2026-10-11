import { afterEach, describe, expect, it } from "vitest";
import { getLocale, initialLocale, localePath, LOCALE_KEY, setLocale, t } from "./i18n";
import { DIFFICULTY_LABELS, CALL_LABELS } from "./labels";
import { tileLabel } from "./tiles";
import { questionText } from "./scene";
import { pageMeta, publicContent, footerContent } from "../shared/site";

afterEach(() => setLocale("ja"));

describe("language preference", () => {
	it("defaults to Japanese, without browser-language detection", () => expect(initialLocale()).toBe("ja"));
	it("uses saved English", () => expect(initialLocale("", { getItem: () => "en" })).toBe("en"));
	it("lets an explicit Japanese link override saved English", () => expect(initialLocale("?lang=ja", { getItem: () => "en" })).toBe("ja"));
	it("accepts a direct English link", () => expect(initialLocale("?lang=en")).toBe("en"));
	it("ignores unsupported language values", () => expect(initialLocale("?lang=fr", { getItem: () => "bad" })).toBe("ja"));
	it("works when storage is blocked", () => {
		expect(
			initialLocale("", {
				getItem: () => {
					throw new Error("blocked");
				},
			}),
		).toBe("ja");
		setLocale("en", {
			setItem: () => {
				throw new Error("blocked");
			},
		});
		expect(t("日本語", "English")).toBe("English");
	});
	it("writes only the locale preference key", () => {
		const writes: [string, string][] = [];
		setLocale("en", {
			setItem: (key, value) => {
				writes.push([key, value]);
			},
		});
		expect(writes).toEqual([[LOCALE_KEY, "en"]]);
		expect(getLocale()).toBe("en");
	});
	it("preserves problem, referral, review, measurement and hash on English links", () => {
		setLocale("en");
		expect(localePath("/q/42?from=abc&review&measure=off#answer")).toBe("/q/42?from=abc&review=&measure=off&lang=en#answer");
	});
	it("removes only the language parameter when returning to Japanese", () =>
		expect(localePath("/sets?theme=call&page=2&lang=en")).toBe("/sets?theme=call&page=2"));
});

describe("runtime English copy", () => {
	it("updates dynamic labels both ways", () => {
		setLocale("en");
		expect(DIFFICULTY_LABELS.hard).toBe("Hard");
		expect(CALL_LABELS.pass).toBe("Pass");
		expect(questionText("call")).toBe("Would you call?");
		setLocale("ja");
		expect(DIFFICULTY_LABELS.hard).toBe("むずかしい");
		expect(questionText("call")).toBe("鳴く？");
	});
	it("provides English tile names for screen readers without changing tile IDs", () => {
		setLocale("en");
		expect(tileLabel("5mr")).toBe("Red 5 characters");
		expect(tileLabel("P")).toBe("White dragon");
	});
	it("keeps Japanese as the static content default", () => expect(publicContent("/rules")).toContain("対局ルール"));
	it("translates rules, model attribution and existing measurement choices", () => {
		expect(publicContent("/rules", "en")).toContain("not an official model");
		expect(publicContent("/about", "en")).toContain("data-measurement-control");
		expect(publicContent("/about", "en")).toContain('href="/sets?lang=en"');
		expect(footerContent("/about", "en")).toContain("Recover your progress");
	});
	it("localizes page metadata without expanding the indexable URL set", () => {
		expect(pageMeta("/rules", "en").title).toContain("How to play");
		expect(pageMeta("/rules", "en").canonical).toBe(pageMeta("/rules").canonical);
		expect(pageMeta("/q/42", "en").noindex).toBe(true);
	});
});
