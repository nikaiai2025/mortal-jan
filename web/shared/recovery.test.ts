import { describe, expect, it } from "vitest";
import { formatSpell, normalizeSpell } from "./recovery";

describe("recovery spell", () => {
	const raw = "abcdefghijkmnpqrstuvwxyz23456789";
	it("accepts separators, pasted whitespace and full-width uppercase", () => {
		const wide = formatSpell(raw).toUpperCase().replace(/[A-Z2-9]/g, (char) => String.fromCharCode(char.charCodeAt(0) + 0xfee0));
		expect(normalizeSpell(` \n${wide}\n `)).toBe(raw);
		expect(formatSpell(raw)).toBe("abcd-efgh-ijkm-npqr-stuv-wxyz-2345-6789");
	});
	it("rejects mistyped or unbounded input", () => {
		for (const value of [null, {}, "", raw.slice(1), raw.replace("a", "o"), "a".repeat(129)]) {
			expect(normalizeSpell(value)).toBeNull();
		}
	});
});
