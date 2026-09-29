import { describe, expect, it } from "vitest";
import type { Scene } from "../shared/types";
import { handSlotAt, handSlots, meldTiles, questionText } from "./scene";

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

describe("hand slots", () => {
	const scene = (melds: Scene["melds"][number] = []) =>
		({ seat: 0, hand: ["1m", "2m", "3m", "4m"], drawn: "5m", melds: [melds, [], [], []] }) as unknown as Scene;

	it("separates the drawn tile from the hand", () => {
		const slots = handSlots(scene());
		const gap = slots[4].x - (slots[3].x + slots[3].w);
		expect(gap).toBeGreaterThan(0);
		expect(slots[1].x - (slots[0].x + slots[0].w)).toBeCloseTo(0);
	});

	it("maps a tap to the tile under it, also a little above a raised tile", () => {
		const slots = handSlots(scene());
		const middle = (i: number) => slots[i].x + slots[i].w / 2;
		expect(handSlotAt(scene(), middle(2), slots[2].y + 10)).toBe(2);
		expect(handSlotAt(scene(), middle(4), slots[4].y - 20)).toBe(4);
		expect(handSlotAt(scene(), (slots[3].x + slots[3].w + slots[4].x) / 2, slots[4].y + 10)).toBeNull(); // the gap
		expect(handSlotAt(scene(), middle(0), slots[0].y - 200)).toBeNull();
	});

	it("keeps the row inside the table when melds need room", () => {
		const pon = { type: "pon" as const, pai: "E", consumed: ["E", "E"], target: 1 };
		const many = { seat: 0, hand: Array(13).fill("1m"), drawn: "2m", melds: [[pon, pon, pon, pon], [], [], []] } as unknown as Scene;
		const slots = handSlots(many);
		expect(slots[0].x).toBeGreaterThanOrEqual(0);
		expect(slots.at(-1)!.x + slots.at(-1)!.w).toBeLessThan(1000);
	});
});
