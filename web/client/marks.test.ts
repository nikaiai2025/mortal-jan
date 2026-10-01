import { describe, expect, it } from "vitest";
import type { Mark } from "../shared/rules";
import { HANAMARU_ODDS, type HanamaruStyle, hanamaruFor, markDrawing } from "./marks";

/** A small seeded random source (mulberry32), so that a drawing can be repeated. */
function seeded(seed: number): () => number {
	return () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const STYLES = Object.keys(HANAMARU_ODDS) as HanamaruStyle[];
const MARKS: [Mark, HanamaruStyle][] = [...STYLES.map((style): [Mark, HanamaruStyle] => ["hanamaru", style]), ["maru", "loop"], ["sankaku", "loop"], ["batsu", "loop"]];
const paths = (mark: Mark, style: HanamaruStyle, random: () => number) => markDrawing(mark, style, random).strokes.map((s) => s.d);

describe("hanamaruFor", () => {
	it("gives the same design for the same answer", () => {
		expect(hanamaruFor("abc", 12)).toBe(hanamaruFor("abc", 12));
	});

	it("follows the odds across players and problems", () => {
		const counts = Object.fromEntries(STYLES.map((style) => [style, 0])) as Record<HanamaruStyle, number>;
		const total = 200 * 500;
		for (let player = 0; player < 200; player++) {
			for (let problem = 1; problem <= 500; problem++) counts[hanamaruFor(`p${player}x`, problem)]++;
		}
		for (const [style, odds] of Object.entries(HANAMARU_ODDS) as [HanamaruStyle, number][]) {
			expect(counts[style] / total).toBeCloseTo(odds / 100, 2);
		}
	});
});

describe("markDrawing", () => {
	it("draws the same mark for the same random source and a different one otherwise", () => {
		for (const [mark, style] of MARKS) {
			expect(paths(mark, style, seeded(7)), `${mark}/${style}`).toEqual(paths(mark, style, seeded(7)));
			expect(paths(mark, style, seeded(7)), `${mark}/${style}`).not.toEqual(paths(mark, style, seeded(8)));
		}
	});

	it("keeps every mark, with its sway and the pen's width, inside the box (bloom above the seal)", () => {
		const half = 7 / 2;
		for (let seed = 1; seed <= 40; seed++) {
			for (const [mark, style] of MARKS) {
				const numbers = paths(mark, style, seeded(seed)).flatMap((d) => d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? []);
				const xs = numbers.filter((_, i) => i % 2 === 0);
				const ys = numbers.filter((_, i) => i % 2 === 1);
				const label = `${mark}/${style} seed ${seed}`;
				expect(Math.min(...xs, ...ys) - half, label).toBeGreaterThanOrEqual(-6);
				expect(Math.max(...xs, ...ys) + half, label).toBeLessThanOrEqual(206);
				if (mark === "hanamaru" && style === "bloom") expect(Math.max(...ys) + half, label).toBeLessThanOrEqual(172);
			}
		}
	});
});
