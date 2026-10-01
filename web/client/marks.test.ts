import { describe, expect, it } from "vitest";
import type { Mark } from "../shared/rules";
import type { Difficulty } from "../shared/types";
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
		for (const difficulty of ["easy", "normal", "hard"] as const) {
			expect(hanamaruFor("abc", 12, difficulty)).toBe(hanamaruFor("abc", 12, difficulty));
		}
	});

	it("follows the odds by difficulty and replaces the hard-only flower with smile", () => {
		const difficulties: Difficulty[] = ["easy", "normal", "hard"];
		const counts = Object.fromEntries(difficulties.map((difficulty) => [difficulty, Object.fromEntries(STYLES.map((style) => [style, 0]))])) as Record<Difficulty, Record<HanamaruStyle, number>>;
		const total = 200 * 500;
		for (let player = 0; player < 200; player++) {
			for (let problem = 1; problem <= 500; problem++) {
				const hard = hanamaruFor(`p${player}x`, problem, "hard");
				counts.hard[hard]++;
				for (const difficulty of ["easy", "normal"] as const) {
					const style = hanamaruFor(`p${player}x`, problem, difficulty);
					if (style !== (hard === "bloom" ? "smile" : hard)) throw new Error("difficulty changed a regular mark or failed to replace bloom");
					counts[difficulty][style]++;
				}
			}
		}
		for (const difficulty of difficulties) {
			const expected = { crayon: 30, loop: 30, swirl: 30, smile: difficulty === "hard" ? 6 : 10, bloom: difficulty === "hard" ? 4 : 0 };
			for (const style of STYLES) expect(counts[difficulty][style] / total, `${difficulty}/${style}`).toBeCloseTo(expected[style] / 100, 2);
			if (difficulty !== "hard") expect(counts[difficulty].bloom).toBe(0);
		}
	});

	it("does not award the hard-only flower when difficulty is unavailable", () => {
		for (let problem = 1; problem <= 500; problem++) {
			expect(hanamaruFor("abc", problem, null)).toBe(hanamaruFor("abc", problem, "normal"));
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
		const half = 9 / 2;
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
