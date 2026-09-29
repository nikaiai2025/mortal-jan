import { describe, expect, it } from "vitest";
import { displayName, jstDate, markOf, setOf, setProblemIds } from "./rules";

describe("markOf", () => {
	it.each([
		[100, true, "hanamaru"],
		[99, false, "maru"],
		[70, false, "maru"],
		[69, false, "sankaku"],
		[30, false, "sankaku"],
		[29, false, "batsu"],
		[0, false, "batsu"],
	] as const)("%i points (pitari %s) → %s", (score, pitari, mark) => {
		expect(markOf(score, pitari)).toBe(mark);
	});
});

describe("problem sets", () => {
	it("chunks problem numbers by ten", () => {
		expect(setOf(1)).toBe(1);
		expect(setOf(10)).toBe(1);
		expect(setOf(11)).toBe(2);
		expect(setProblemIds(2)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
	});
});

describe("jstDate", () => {
	it("switches the day at midnight in Japan", () => {
		expect(jstDate(new Date("2026-09-30T14:59:59Z"))).toBe("2026-09-30");
		expect(jstDate(new Date("2026-09-30T15:00:00Z"))).toBe("2026-10-01");
	});
});

describe("displayName", () => {
	it("falls back to the public id", () => {
		expect(displayName(null, "abcd2345")).toBe("名無し#abcd2345");
		expect(displayName("雀士", "abcd2345")).toBe("雀士");
	});
});
