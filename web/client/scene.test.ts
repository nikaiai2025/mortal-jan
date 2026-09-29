import { describe, expect, it } from "vitest";
import { meldTiles, questionText } from "./scene";

describe("meldTiles", () => {
	const pon = (target: number) => meldTiles({ type: "pon", pai: "5p", consumed: ["5pr", "5p"], target }, 0);

	it("turns the called tile sideways on the side it came from", () => {
		expect(pon(3).map((t) => t.sideways ?? false)).toEqual([true, false, false]); // from the left
		expect(pon(2).map((t) => t.sideways ?? false)).toEqual([false, true, false]); // from across
		expect(pon(1).map((t) => t.sideways ?? false)).toEqual([false, false, true]); // from the right
	});

	it("stacks the kakan tile on the sideways tile", () => {
		const tiles = meldTiles({ type: "kakan", pai: "E", consumed: ["E", "E"], target: 2, added: "E" }, 0);
		expect(tiles.map((t) => [t.sideways ?? false, t.stacked ?? false])).toEqual([
			[false, false],
			[true, false],
			[true, true],
			[false, false],
		]);
	});

	it("shows an ankan with both ends face down", () => {
		const tiles = meldTiles({ type: "ankan", consumed: ["N", "N", "N", "N"] }, 1);
		expect(tiles.map((t) => t.back ?? false)).toEqual([true, false, false, true]);
	});
});

describe("questionText", () => {
	it("asks about the available calls", () => {
		expect(questionText("call", [{ action: "chi_low" }, { action: "pass" }])).toBe("チーする？");
		expect(questionText("call", [{ action: "pon" }, { action: "pass" }])).toBe("ポンする？");
		expect(questionText("call", [{ action: "chi_mid" }, { action: "pon" }, { action: "pass" }])).toBe("鳴く？");
	});
});
