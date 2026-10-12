import { afterEach, expect, it } from "vitest";
import { setLocale } from "./i18n";
import { localizedPlayerName } from "./player-label";

afterEach(() => setLocale("ja"));
it("localizes only a missing name and responds to locale changes", () => {
 const identity = { name: null, publicId: "abcd2345" };
 expect(localizedPlayerName("名無し#abcd2345", identity)).toBe("名無し#abcd2345");
 setLocale("en");
 expect(localizedPlayerName("名無し#abcd2345", identity)).toBe("Anonymous#abcd2345");
 setLocale("ja");
 expect(localizedPlayerName("名無し#abcd2345", identity)).toBe("名無し#abcd2345");
});
it.each(["名無し#abcd2345", "名無し#other", "雀士", "Anonymous#abcd2345"])("preserves the chosen name %s", (name) => {
 setLocale("en");
 expect(localizedPlayerName(name, { name, publicId: "abcd2345" })).toBe(name);
});
it("does not guess anonymity from old API display strings", () => {
 setLocale("en");
 expect(localizedPlayerName("名無し#abcd2345")).toBe("名無し#abcd2345");
});
