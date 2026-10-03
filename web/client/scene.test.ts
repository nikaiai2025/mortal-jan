import { describe, expect, it } from "vitest";
import type { Scene } from "../shared/types";
import { RAISE, SCENE_WIDTH, callableSlots, handBand, handSlots, meldTiles, postRiichiRiverHighlights, postRiichiRiverPolygon, questionText, riichiOrder, sceneHeight, targetCentre } from "./scene";

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
	it("uses one prompt per problem kind", () => {
		expect(questionText("discard")).toBe("何を切る？");
		expect(questionText("riichi")).toBe("リーチする？ 何を切る？");
		expect(questionText("call")).toBe("鳴く？");
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

	it("keeps the row inside the table when melds need room", () => {
		const pon = { type: "pon" as const, pai: "E", consumed: ["E", "E"], target: 1 };
		const many = { seat: 0, hand: Array(13).fill("1m"), drawn: "2m", melds: [[pon, pon, pon, pon], [], [], []] } as unknown as Scene;
		const slots = handSlots(many);
		expect(slots[0].x).toBeGreaterThanOrEqual(0);
		expect(slots.at(-1)!.x + slots.at(-1)!.w).toBeLessThan(SCENE_WIDTH);
	});
});

describe("band above the hand", () => {
	const scene = (target: Scene["target"]) => ({ seat: 0, hand: ["1m"], drawn: null, melds: [[], [], [], []], target }) as unknown as Scene;

	it("leaves the same room above call and discard hands, clear of raised tiles", () => {
		const band = handBand();
		expect(band.bottom).toBeGreaterThan(band.top);
		for (const target of [null, { actor: 1, pai: "3m" }]) {
			const slot = handSlots(scene(target))[0];
			expect(band.bottom).toBeLessThan(slot.y - RAISE);
			expect(slot.y + slot.h).toBeLessThan(sceneHeight());
		}
	});
});

describe("call marks", () => {
	const river = (n: number) => Array.from({ length: n }, () => ({ pai: "1m", tsumogiri: false, riichi: false, called: false }));
	const scene = (actor: number, hand = ["4s", "5s", "5sr", "6s", "9s"]) =>
		({ seat: 0, hand, drawn: null, melds: [[], [], [], []], rivers: [river(3), river(4), river(5), river(7)], target: { actor, pai: "4s" } }) as unknown as Scene;

	it("finds the discard on the side of the player who made it", () => {
		const centre = { x: SCENE_WIDTH / 2, y: targetCentre(scene(2))!.y };
		const right = targetCentre(scene(1))!;
		const across = targetCentre(scene(2))!;
		const left = targetCentre(scene(3))!;
		expect(right.x).toBeGreaterThan(centre.x);
		expect(left.x).toBeLessThan(centre.x);
		expect(across.y).toBeLessThan(right.y);
		expect(across.y).toBeLessThan(left.y);
		expect(targetCentre({ ...scene(1), target: null })).toBeNull();
	});

	it("marks every hand tile of a kind the choices use, a red five as a five", () => {
		const choices = [{ action: "chi_low", consumed: ["5sr", "6s"] }, { action: "pass" }];
		expect(callableSlots(scene(3), choices).map((slot) => slot.pai)).toEqual(["5s", "5sr", "6s"]);
	});
});

describe("discards after riichi", () => {
	const river = (n: number) => Array.from({ length: n }, () => ({ pai: "1m", tsumogiri: false, riichi: false, called: false }));
	const scene = () => ({
		seat: 0, rivers: [river(22), river(20), river(21), river(20)], riichi: [false, true, true, true],
		riichiDiscardCounts: [null, [11, 11, 11, 11], [5, 5, 4, 5], [15, 15, 15, 14]],
	}) as unknown as Scene;

	it("uses declaration order rather than seat or river length, with distinct nested boundaries", () => {
		expect(riichiOrder(scene())).toEqual([2, 1, 3]);
		expect(postRiichiRiverHighlights(scene(), 0).map(({ actor, start }) => [actor, start])).toEqual([[2, 5], [1, 11], [3, 15]]);
		// The owner's declaration tile starts their color; other declarations use the same rule.
		expect(postRiichiRiverHighlights(scene(), 2).map(({ actor, start }) => [actor, start])).toEqual([[2, 4], [1, 11], [3, 15]]);
		expect(postRiichiRiverHighlights(scene(), 3).map(({ actor, start }) => [actor, start])).toEqual([[2, 5], [1, 11], [3, 14]]);
	});

	it("uses only the declaration tile onward for a legacy riichi river", () => {
		const current = scene();
		delete current.riichiDiscardCounts;
		current.rivers[1][7].riichi = true;
		expect(postRiichiRiverHighlights(current, 1).map(({ actor, start }) => [actor, start])).toEqual([[1, 7]]);
		expect(postRiichiRiverHighlights(current, 0)).toEqual([]);
	});

	it("does not infer a boundary from old or incomplete data, or mark an unaccepted declaration", () => {
		const current = scene();
		delete current.riichiDiscardCounts;
		expect(postRiichiRiverHighlights(current, 0)).toEqual([]);
		current.riichiDiscardCounts = [null, null, [5, 5, 4, 5], null];
		expect(postRiichiRiverHighlights(current, 0)).toEqual([]);
		current.riichi = [false, false, true, false];
		expect(postRiichiRiverHighlights(current, 0).map(({ actor, start }) => [actor, start])).toEqual([[2, 5]]);
		current.riichi = [false, false, false, false];
		expect(postRiichiRiverHighlights(current, 0)).toEqual([]);
	});

	it("never covers pre-declaration tiles across row folds or an extended third row", () => {
		const contains = (points: { x: number; y: number }[], x: number, y: number) => {
			let inside = false;
			for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
				const a = points[i], b = points[j];
				if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
			}
			return inside;
		};
		for (let length = 1; length <= 24; length++) {
			for (let start = 0; start <= length; start++) {
				const polygon = postRiichiRiverPolygon(river(length), start, 100);
				for (let index = 0; index < length; index++) {
					const row = Math.min(Math.floor(index / 6), 2);
					const col = index - row * 6;
					expect(contains(polygon, -132 + (col + 0.5) * 44, 100 + (row + 0.5) * 59)).toBe(index >= start);
				}
			}
		}
	});
});
