import { describe, expect, it } from "vitest";
import type { Result, Scene } from "../shared/types";
import { chosenSlot, handBars } from "./evaluation";

const scene = { hand: ["1m", "1m", "5p", "5pr", "E"], drawn: "9s" } as unknown as Scene;

function result(kind: Result["kind"], action: string, best: string, candidates: [string, number][]): Result {
	return {
		kind,
		scene,
		answer: { action, score: 50, pitari: action === best },
		evaluation: { best, candidates: candidates.map(([a, p]) => ({ action: a, q: 0, p, score: 0 })) },
	} as unknown as Result;
}

describe("handBars", () => {
	it("gives every copy of a tile the same bar and keeps red fives apart", () => {
		const bars = handBars(result("discard", "d:E", "d:5pr", [["d:5pr", 0.6], ["d:5p", 0.3], ["d:1m", 0.1]]));
		expect(bars.map((b) => b.dama)).toEqual([0.1, 0.1, 0.3, 0.6, undefined, undefined]);
		expect(bars.map((b) => b.best)).toEqual([false, false, false, true, false, false]);
	});

	it("adds the riichi bar next to the dama bar", () => {
		const bars = handBars(result("riichi", "r:9s", "r:9s", [["r:9s", 0.5], ["d:9s", 0.4], ["d:E", 0.1]]));
		expect(bars[5]).toEqual({ dama: 0.4, riichi: 0.5, best: true });
		expect(bars[4]).toEqual({ dama: 0.1, riichi: undefined, best: false });
	});
});

describe("chosenSlot", () => {
	it("marks the first copy of the discarded tile, including the drawn tile", () => {
		expect(chosenSlot(result("discard", "d:1m", "d:1m", []))).toBe(0);
		expect(chosenSlot(result("riichi", "r:9s", "r:9s", []))).toBe(5);
		expect(chosenSlot(result("call", "pass", "pass", []))).toBeNull();
	});
});
