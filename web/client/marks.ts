// Red-pen marks drawn stroke by stroke (回答後の演出). Paths live in a 200×200 box.

import type { Mark } from "../shared/rules";
import type { Difficulty } from "../shared/types";

export interface Stroke {
	d: string;
	/** Drawing time in ms at normal speed. */
	duration: number;
}

/** A mark ready to draw: its strokes in writing order, all with the same red pen. */
export interface MarkDrawing {
	strokes: Stroke[];
}

export const MARK_BOX = 200;
export const RED_INK = "#d62a1e";
/** One pen for every mark. */
const STROKE_WIDTH = 9;

/** Hanamaru odds for hard problems; other difficulties replace bloom with smile. */
export const HANAMARU_ODDS = { crayon: 30, loop: 30, swirl: 30, smile: 6, bloom: 4 } as const;
export type HanamaruStyle = keyof typeof HANAMARU_ODDS;

/** The hanamaru a player gets for a problem: fixed per answer, so every screen and share image agree. */
export function hanamaruFor(publicId: string | null, problemId: number, difficulty: Difficulty | null): HanamaruStyle {
	let hash = 0x811c9dc5;
	for (const char of `${publicId ?? ""}:${problemId}`) hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193);
	// Finalise (murmur3) so that neighbouring problem ids land far apart.
	hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
	hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
	let roll = ((hash ^ (hash >>> 16)) >>> 0) % 100;
	for (const [style, odds] of Object.entries(HANAMARU_ODDS) as [HanamaruStyle, number][]) {
		if (roll < odds) return style === "bloom" && difficulty !== "hard" ? "smile" : style;
		roll -= odds;
	}
	return "loop";
}

/** A point of a line, in reference units until `fit` maps it into the box. */
type Knot = [x: number, y: number];

/** Draws one line through traced pieces; each piece meets the previous one at a sharp corner. */
type Draw = (...pieces: Knot[][]) => string;

/** The i-th Catmull-Rom segment of `points`, as the four points around it. */
function segment<T>(points: T[], i: number): [T, T, T, T] {
	return [points[Math.max(i - 1, 0)], points[i], points[i + 1], points[Math.min(i + 2, points.length - 1)]];
}

const catmullRom = (a: number, b: number, c: number, d: number, t: number) =>
	0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);

const fmt = ([x, y]: Knot) => `${Math.round(x * 10) / 10} ${Math.round(y * 10) / 10}`;

/** A smooth path through each run of points (Catmull-Rom as Bézier curves), runs joined at sharp corners. */
function curves(runs: Knot[][]): string {
	let d = `M${fmt(runs[0][0])}`;
	for (const run of runs) {
		for (let i = 0; i < run.length - 1; i++) {
			const [p0, p1, p2, p3] = segment(run, i);
			const c1: Knot = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
			const c2: Knot = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
			d += `C${fmt(c1)} ${fmt(c2)} ${fmt(p2)}`;
		}
	}
	return d;
}

/**
 * How far a line sways across its path, in box units: a few smooth waves with random wavelength
 * and phase. Waves lengthen with the line (a quarter to half of it, within `wavelength`), so a
 * long line wanders gently instead of trembling. The swing is full on lines of `fullLength` or
 * longer and shrinks on shorter ones; it also eases off where the line bends tighter than
 * `tightRadius` and vanishes at sharp corners, so small parts, knots and joints keep their shape.
 */
const SWAY = { min: 1.25, max: 1.75, fullLength: 80, waves: 3, wavelength: [26, 120], tightRadius: 12 } as const;

/** Draws lines that wander a little across their traced path, differently on every drawing. */
function drawer(random: () => number): Draw {
	return (...pieces) => {
		// Samples along the centre (about one per two box units); a piece starts at the previous one's end.
		const xs: number[] = [];
		const ys: number[] = [];
		const starts: number[] = [];
		let previous: Knot | null = null;
		for (const piece of pieces) {
			const knots = previous ? [previous, ...piece] : piece;
			if (previous) starts.push(xs.length - 1);
			else {
				starts.push(0);
				xs.push(knots[0][0]);
				ys.push(knots[0][1]);
			}
			for (let i = 0; i < knots.length - 1; i++) {
				const [k0, k1, k2, k3] = segment(knots, i);
				const steps = Math.max(1, Math.ceil(Math.hypot(k2[0] - k1[0], k2[1] - k1[1]) / 2));
				for (let j = 1; j <= steps; j++) {
					xs.push(catmullRom(k0[0], k1[0], k2[0], k3[0], j / steps));
					ys.push(catmullRom(k0[1], k1[1], k2[1], k3[1], j / steps));
				}
			}
			previous = piece[piece.length - 1];
		}
		const n = xs.length;
		const along = [0];
		for (let i = 1; i < n; i++) along.push(along[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]));
		const total = along[n - 1];

		// How freely each point may sway: 1 on gentle curves, less on tight ones, 0 at corners.
		const free = xs.map((_, i) => {
			const a = Math.max(i - 2, 0);
			const b = Math.min(i + 2, n - 1);
			const turn = Math.abs(
				Math.atan2(ys[b] - ys[i], xs[b] - xs[i]) - Math.atan2(ys[i] - ys[a], xs[i] - xs[a]),
			);
			const angle = Math.min(turn, 2 * Math.PI - turn);
			return angle < 1e-6 ? 1 : Math.min(1, (along[b] - along[a]) / angle / SWAY.tightRadius);
		});
		const calm = free.map((_, i) => {
			let least = 1;
			for (let j = Math.max(i - 2, 0); j <= Math.min(i + 2, n - 1); j++) least = Math.min(least, free[j]);
			return least;
		});

		const amplitude = (SWAY.min + (SWAY.max - SWAY.min) * random()) * Math.min(1, total / SWAY.fullLength);
		const clamp = (v: number) => Math.min(SWAY.wavelength[1], Math.max(SWAY.wavelength[0], v));
		const [shortest, longest] = [clamp(total / 4), clamp(total / 2)];
		const waves = Array.from({ length: SWAY.waves }, () => ({
			wavelength: shortest + (longest - shortest) * random(),
			phase: 2 * Math.PI * random(),
			weight: 0.5 + random(),
		}));
		const weights = waves.reduce((sum, w) => sum + w.weight, 0);
		const moved: Knot[] = xs.map((x, i) => {
			const a = Math.max(i - 1, 0);
			const b = Math.min(i + 1, n - 1);
			const length = Math.hypot(xs[b] - xs[a], ys[b] - ys[a]) || 1;
			let wave = 0;
			for (const w of waves) wave += w.weight * Math.sin((2 * Math.PI * along[i]) / w.wavelength + w.phase);
			const offset = (amplitude * calm[i] * wave) / weights;
			return [x - ((ys[b] - ys[a]) / length) * offset, ys[i] + ((xs[b] - xs[a]) / length) * offset];
		});

		// Thin each piece to a point every few units for the path.
		const runs = starts.map((start, k) => {
			const end = k + 1 < starts.length ? starts[k + 1] : n - 1;
			const run: Knot[] = [moved[start]];
			for (let i = start + 1; i < end; i++) if (along[i] - along[start] >= 3.5 * run.length && along[end] - along[i] >= 1.5) run.push(moved[i]);
			run.push(moved[end]);
			return run;
		});
		return curves(runs);
	};
}

/**
 * Maps points traced on a reference drawing into the mark box: `scale` about the reference
 * point (cx, cy), which lands on (ox, oy).
 */
const fit =
	(scale: number, cx: number, cy: number, ox = 100, oy = 100) =>
	(points: Knot[]): Knot[] =>
		points.map(([x, y]) => [ox + (x - cx) * scale, oy + (y - cy) * scale]);

/** A small closed loop (reference units) that the pen fills in, e.g. an eye. `tilt` turns its long axis from upright towards the right. */
const blob = (x: number, y: number, along: number, across: number, tilt = 0): Knot[] =>
	Array.from({ length: 13 }, (_, i) => {
		const a = (i / 12) * 2 * Math.PI;
		const [u, v] = [along * Math.cos(a), across * Math.sin(a)];
		return [x + u * Math.sin(tilt) - v * Math.cos(tilt), y + u * Math.cos(tilt) + v * Math.sin(tilt)];
	});

// Each design is traced from the reference drawings: first the centre, then the petals around it
// (drawn clockwise from the lower left, turning sharply at every joint), then the details.
const HANAMARU: Record<HanamaruStyle, (draw: Draw) => Stroke[]> = {
	// Crayon: a small spiral that opens out, with petals over the top, open at the bottom.
	crayon: (draw) => {
		const at = fit(0.857, 126.5, 91.5);
		return [
			{
				d: draw(at([[131.6, 112.6], [133.7, 103.0], [133.3, 100.9], [129.9, 99.7], [126.4, 99.7], [118.9, 104.3], [113.5, 113.5], [113.1, 119.0], [114.7, 123.9], [117.9, 127.5], [126.4, 130.0], [135.3, 128.7], [144.0, 125.4], [151.8, 120.7], [158.9, 115.1], [165.3, 108.5], [170.8, 100.6], [174.4, 91.1], [175.0, 81.7], [172.3, 73.8], [165.9, 68.5], [156.6, 65.7], [145.6, 65.2], [135.0, 66.9], [125.1, 70.1], [116.2, 74.0], [107.7, 78.5], [99.4, 84.1], [91.4, 90.5], [84.5, 97.1], [78.7, 104.2], [73.8, 113.2], [70.3, 123.5], [69.5, 133.6], [72.3, 143.2], [79.5, 151.3], [84.4, 154.0], [95.0, 156.6], [105.2, 155.9], [114.8, 152.9], [124.3, 147.6], [129.1, 144.4]])),
				duration: 480,
			},
			{
				d: draw(
					at([[65.4, 164.2], [55.5, 168.8], [45.2, 171.4], [35.2, 171.1], [26.1, 167.2], [19.7, 159.6], [17.5, 150.1], [19.1, 140.8], [23.3, 132.9], [29.5, 126.5], [31.0, 124.4], [35.5, 124.8], [39.8, 124.8], [40.4, 122.2]]),
					at([[39.8, 119.5], [35.5, 119.4], [31.5, 119.4], [27.6, 113.7], [25.0, 104.5], [26.4, 94.2], [30.4, 85.3], [35.5, 78.4], [41.8, 72.0], [49.1, 65.8], [57.4, 60.4], [66.1, 56.4], [74.2, 53.7], [81.5, 53.7], [87.4, 57.6], [89.5, 60.5], [90.3, 63.9]]),
					at([[89.1, 58.6], [94.3, 49.2], [100.6, 41.2], [108.4, 33.8], [116.7, 26.8], [125.7, 20.8], [135.1, 15.9], [144.5, 12.6], [153.5, 11.1], [162.5, 12.4], [170.1, 17.2], [174.2, 25.3], [174.9, 33.9], [172.4, 41.8], [167.2, 50.2]]),
					at([[169.6, 46.1], [175.2, 39.6], [182.3, 36.2], [190.7, 35.4], [199.5, 36.5], [207.8, 39.4], [213.9, 44.8], [216.7, 52.3], [216.4, 60.4], [215.6, 64.4], [214.0, 67.6], [209.3, 74.6], [202.4, 80.8], [198.2, 84.0]]),
					at([[200.9, 80.9], [209.0, 79.0], [218.1, 80.8], [227.0, 85.9], [233.4, 93.6], [234.9, 102.1], [231.9, 109.7], [226.2, 116.5], [218.7, 121.8], [210.0, 125.6], [200.0, 128.6], [194.5, 130.0], [188.8, 131.1], [183.1, 132.1], [177.5, 133.1]]),
				),
				duration: 1000,
			},
		];
	},
	// A cursive "e" winding out, and petals with a hook or a small knot at each joint.
	loop: (draw) => {
		const at = fit(0.907, 114.5, 83);
		return [
			{
				d: draw(at([[100.4, 111.9], [108.5, 108.9], [117.0, 105.1], [125.3, 99.9], [131.5, 93.7], [133.9, 90.3], [134.7, 86.9], [134.9, 84.5], [134.2, 82.1], [132.3, 79.9], [129.4, 78.1], [121.3, 76.7], [111.6, 77.3], [101.7, 80.4], [93.1, 85.7], [87.1, 92.8], [85.2, 101.4], [87.9, 109.5], [94.1, 115.7], [103.2, 119.5], [113.8, 121.0], [123.9, 120.4], [133.2, 118.2], [142.0, 114.7], [150.2, 110.2], [157.9, 104.7], [164.1, 97.3], [168.6, 88.0], [169.8, 77.8], [167.0, 68.2], [160.7, 61.0], [152.2, 55.8], [142.0, 51.9], [136.5, 50.6], [130.9, 49.7], [125.2, 49.3], [119.5, 49.3], [113.7, 49.8], [108.0, 50.7], [102.3, 52.1], [96.7, 53.8], [91.4, 55.8], [81.9, 60.3], [73.9, 65.6], [66.7, 72.4], [63.3, 76.7], [60.5, 81.6], [58.4, 86.8], [57.1, 92.4], [56.8, 98.1], [57.4, 103.9], [58.8, 109.5], [61.2, 114.9], [64.5, 119.8], [68.4, 124.0], [77.2, 130.1], [86.4, 133.7], [95.3, 135.4], [99.7, 135.9]])),
				duration: 520,
			},
			{
				d: draw(
					at([[61.0, 128.4], [55.3, 128.8], [44.3, 128.6], [34.7, 126.5], [26.2, 122.4], [19.0, 116.2], [14.0, 108.1], [11.7, 98.3], [12.7, 88.3], [17.0, 79.1], [24.1, 71.6], [32.8, 67.0], [42.0, 64.9], [45.4, 66.2], [44.4, 68.3], [45.3, 70.8], [47.6, 72.3], [49.8, 71.9], [50.8, 69.8], [49.9, 67.3], [47.7, 65.8], [45.4, 66.2], [45.6, 65.2]]),
					at([[43.1, 63.3], [44.2, 57.2], [45.6, 51.3], [47.6, 45.6], [50.2, 40.2], [53.4, 35.3], [57.2, 31.0], [65.7, 24.4], [75.0, 20.3], [84.3, 18.4], [93.5, 18.7], [102.6, 21.3], [109.6, 26.6], [111.4, 33.9]]),
					at([[110.9, 28.8], [118.4, 21.6], [127.5, 16.2], [136.5, 12.5], [145.7, 10.1], [156.3, 8.9], [167.2, 9.9], [177.1, 13.8], [184.6, 20.5], [188.6, 29.0], [189.3, 37.8], [187.6, 46.2], [182.3, 54.1], [178.2, 57.3]]),
					at([[183.4, 54.7], [192.2, 54.6], [195.7, 55.0], [199.0, 55.7], [205.7, 59.2], [211.1, 65.0], [213.4, 73.4], [212.2, 82.2], [208.5, 89.9], [202.5, 96.2], [194.4, 101.5], [185.5, 105.2], [176.6, 107.8], [168.1, 109.1], [160.0, 108.9]]),
					at([[166.3, 108.9], [172.8, 115.9], [173.6, 119.9], [171.8, 127.8], [166.8, 135.0], [159.5, 141.0], [151.2, 145.3], [142.3, 147.8], [132.8, 148.2], [123.3, 146.4], [115.8, 142.3], [113.2, 139.4], [112.3, 136.1]]),
					at([[113.9, 140.4], [109.5, 147.9], [101.6, 152.7], [92.2, 154.7], [82.9, 154.3], [74.0, 151.9], [71.3, 150.3], [68.6, 148.1], [66.7, 145.9], [65.2, 143.3], [63.9, 139.4], [64.1, 137.6], [65.5, 134.4]]),
				),
				duration: 1100,
			},
		];
	},
	// A tight double swirl whose outer ring runs out through the lower joint, and petals all round.
	swirl: (draw) => {
		const at = fit(1, 110, 85);
		return [
			{
				d: draw(at([[127.8, 110.2], [127.4, 103.6], [125.8, 97.9], [122.6, 93.4], [117.8, 90.8], [112.2, 90.4], [106.6, 92.2], [98.1, 99.7], [95.5, 108.2], [96.9, 117.5], [103.0, 126.2], [111.3, 131.7], [121.7, 133.1], [132.3, 130.4], [141.5, 124.8], [149.0, 117.9], [154.7, 110.0], [158.6, 100.8], [159.8, 90.4], [157.4, 79.9], [152.0, 70.5], [144.8, 63.7], [136.3, 59.9], [127.0, 57.9], [117.1, 58.3], [107.0, 60.7], [97.7, 64.7], [89.4, 70.1], [82.5, 76.1], [76.9, 82.6], [72.5, 90.0], [69.4, 97.8], [68.0, 106.3], [68.7, 115.4], [71.9, 124.1], [77.2, 131.5], [83.6, 137.4], [91.3, 141.6], [100.3, 144.4], [110.6, 144.3], [116.0, 143.6]])),
				duration: 520,
			},
			{
				d: draw(
					at([[62.0, 108.7], [56.1, 110.4], [50.2, 111.3], [39.7, 109.6], [30.9, 104.5], [26.9, 100.7], [23.4, 96.2], [20.9, 91.0], [19.3, 80.1], [21.2, 70.1], [25.8, 60.9], [32.6, 53.0], [40.3, 47.3], [48.5, 43.9], [57.6, 41.6], [67.8, 40.6], [78.1, 41.1], [86.2, 43.3], [88.6, 45.6], [89.9, 48.5]]),
					at([[90.8, 44.2], [95.5, 35.7], [101.7, 27.7], [109.6, 21.0], [118.6, 16.0], [128.2, 12.3], [138.0, 10.2], [148.0, 10.0], [158.1, 11.7], [167.6, 16.5], [174.5, 24.8], [177.1, 34.9], [176.4, 44.6], [173.7, 53.3], [169.7, 61.6]]),
					at([[173.8, 61.3], [181.9, 61.5], [190.1, 64.0], [197.4, 70.4], [200.7, 80.3], [199.3, 90.9], [194.4, 100.0], [187.6, 107.5], [180.0, 114.0], [171.7, 119.8]]),
					at([[173.7, 123.0], [171.6, 131.6], [165.7, 139.0], [157.7, 145.1], [149.0, 149.4], [139.9, 152.5], [130.1, 155.0], [120.5, 156.4], [112.1, 154.9], [108.7, 153.1], [104.2, 146.8], [102.4, 142.9]]),
					at([[98.4, 145.6], [91.6, 152.0], [82.8, 156.9], [72.9, 158.8], [63.8, 158.0], [55.6, 154.2], [48.8, 148.1], [44.3, 139.7], [44.0, 129.3], [47.4, 119.4], [53.9, 112.3], [62.0, 108.1]]),
				),
				duration: 1000,
			},
		];
	},
	// Rare: a smiling face (the face circle left open), petals with small curls at the joints.
	smile: (draw) => {
		const at = fit(0.744, 140, 105);
		// A short, fat bean, 55° from the horizontal.
		const eye = (x: number, y: number) => at(blob(x, y, 5.6, 1, 0.61));
		return [
			{
				d: draw(at([[155.0, 163.9], [144.2, 163.5], [133.6, 162.4], [123.4, 160.4], [113.7, 157.7], [104.8, 154.7], [96.9, 150.6], [90.6, 144.5], [86.7, 136.5], [85.5, 127.6], [86.9, 118.1], [90.0, 109.5], [94.4, 102.2], [100.4, 95.7], [108.2, 89.5], [117.1, 84.1], [126.1, 79.7], [135.6, 76.2], [145.2, 73.6], [155.0, 72.0], [164.9, 71.7], [174.5, 72.8], [183.9, 75.6], [193.0, 80.6], [201.3, 87.7], [208.3, 96.0], [213.3, 105.1], [214.7, 114.4], [212.8, 122.8], [208.4, 130.9], [202.3, 138.9], [194.3, 146.1], [189.6, 149.0], [184.6, 151.4], [179.4, 153.5], [174.1, 155.4]])),
				duration: 420,
			},
			{
				d: draw(
					at([[67.2, 173.2], [64.4, 175.6], [60.0, 175.6], [53.7, 175.3], [45.1, 174.6], [37.1, 172.0], [30.5, 166.5], [27.2, 157.7], [28.9, 147.7], [33.2, 138.7], [38.3, 130.9], [43.6, 126.4], [47.6, 124.0]]),
					at([[44.8, 126.0], [36.4, 128.7], [28.0, 127.2], [20.7, 122.6], [17.4, 115.3], [17.6, 106.6], [18.8, 103.8], [20.4, 101.0], [26.0, 95.0], [32.6, 89.6], [39.8, 84.6], [47.5, 80.1], [55.6, 76.6], [64.7, 74.2], [73.0, 74.4], [70.8, 79.2], [72.9, 85.2], [78.1, 88.9], [83.4, 88.1], [85.6, 83.3], [83.4, 77.3], [78.2, 73.6], [73.0, 74.4], [73.8, 71.0]]),
					at([[73.5, 66.4], [76.6, 58.4], [81.4, 50.5], [88.1, 43.4], [96.4, 36.7], [105.3, 30.8], [114.9, 25.8], [125.3, 22.4], [130.9, 21.3], [136.5, 20.7], [147.4, 21.0], [156.8, 23.8], [160.7, 26.8], [163.5, 31.0], [164.5, 36.0], [161.7, 46.5], [159.9, 49.1]]),
					at([[161.6, 45.2], [165.7, 38.0], [171.8, 31.2], [179.3, 25.2], [188.1, 19.9], [198.1, 16.5], [207.9, 15.6], [217.6, 17.3], [226.7, 22.4], [233.6, 30.5], [237.3, 40.2], [238.0, 50.0], [235.9, 60.2], [234.1, 65.7], [231.0, 67.4]]),
					at([[238.6, 64.6], [247.0, 65.3], [255.4, 69.5], [261.6, 77.6], [263.2, 87.7], [260.6, 96.6], [255.3, 103.2], [248.5, 108.6], [240.7, 113.4], [231.5, 114.9]]),
					at([[224.4, 113.3], [228.8, 114.3], [233.6, 115.5], [240.7, 122.0], [245.3, 131.7], [246.3, 142.6], [243.8, 153.1], [238.6, 161.8], [231.7, 168.5], [224.1, 173.9], [214.7, 178.6], [209.4, 180.4], [198.5, 181.9], [188.4, 180.2], [178.6, 176.1], [173.6, 174.0]]),
					at([[169.9, 176.5], [161.3, 182.4], [156.5, 185.3], [146.7, 190.1], [136.6, 193.5], [125.9, 195.2], [115.4, 195.6], [105.0, 194.6], [95.0, 192.1], [86.4, 187.0], [80.7, 179.3], [79.7, 175.9], [79.8, 172.4], [80.6, 168.5], [81.7, 165.4], [83.2, 162.0]]),
				),
				duration: 1100,
			},
			{ d: draw(eye(141, 110)), duration: 120 },
			{ d: draw(eye(161.5, 104)), duration: 120 },
			{ d: draw(at([[109.8, 123.0], [116.8, 129.5], [125.2, 135.3], [130.1, 137.8], [135.2, 140.0], [140.7, 141.6], [146.3, 142.6], [151.9, 142.8], [162.6, 140.9], [167.6, 138.8], [172.4, 135.8], [176.8, 132.0], [180.6, 127.6], [185.9, 118.1], [189.2, 108.1]])), duration: 300 },
		];
	},
	// Rarest: a flower with a face, a stem and two leaves. It stays above y=172 so that the ピタリ
	// seal does not hide the leaves; the face parts and leaves are placed in box units for the one pen.
	bloom: (draw) => {
		const at = fit(0.6, 131.5, 10, 100, 9);
		// A short stroke leaning 25° for a cheek (box units).
		const tick = (x: number, y: number, length: number): Knot[] => [
			[x - 0.21 * length, y - 0.45 * length],
			[x + 0.21 * length, y + 0.45 * length],
		];
		return [
			{
				d: draw(
					at([[130.6, 186.7], [122.7, 193.0], [113.7, 197.0], [104.1, 198.8], [94.5, 199.3], [84.7, 198.2], [75.2, 194.6], [67.6, 188.0], [62.8, 179.8], [61.0, 171.5], [61.8, 163.3], [62.6, 159.1]]),
					at([[57.9, 158.3], [48.1, 156.5], [38.6, 152.1], [31.0, 146.3], [25.3, 139.9], [21.1, 132.7], [18.2, 124.2], [18.2, 114.2], [22.2, 104.4], [29.2, 96.9], [37.1, 91.9], [40.9, 90.8], [44.7, 91.3], [51.3, 96.3]]),
					at([[48.6, 92.6], [41.7, 85.5], [37.3, 75.6], [36.4, 70.0], [36.5, 64.4], [39.9, 54.0], [46.3, 45.5], [54.4, 38.6], [59.0, 35.5], [64.0, 32.7], [69.3, 30.3], [74.9, 28.4], [80.6, 27.1], [86.4, 26.4], [92.2, 26.3], [97.9, 26.8], [103.5, 27.7], [113.6, 31.5], [121.1, 37.5], [125.5, 44.9]]),
					at([[123.1, 40.1], [124.9, 30.4], [130.4, 22.0], [138.2, 15.8], [146.8, 12.7], [155.3, 12.2], [159.4, 12.6], [162.7, 13.9], [165.3, 15.9], [170.0, 23.4], [171.0, 28.2], [168.7, 38.4]]),
					at([[171.2, 34.5], [178.2, 29.1], [188.3, 26.8], [198.7, 27.9], [208.0, 31.9], [215.3, 39.3], [219.5, 49.4], [220.4, 60.1], [218.0, 69.9], [213.2, 78.1]]),
					at([[215.6, 74.7], [223.4, 72.9], [232.6, 76.2], [239.7, 84.6], [242.9, 94.9], [243.4, 105.0], [242.2, 114.9], [238.7, 124.5], [233.6, 133.0], [227.4, 140.2], [219.6, 146.2], [210.2, 150.5]]),
					at([[209.2, 155.6], [206.9, 164.2], [202.7, 171.8], [196.5, 178.5], [188.3, 184.4], [178.6, 188.8], [168.4, 191.0], [159.2, 191.0], [150.5, 188.9], [141.9, 184.2]]),
				),
				duration: 1000,
			},
			{
				// The face: up the right side, round anticlockwise, and on from the bottom into the
				// swirl of the mouth, ending in a short bar in the middle.
				d: draw(at([[171.1, 151.9], [179.6, 146.0], [183.7, 142.5], [187.4, 138.3], [190.5, 133.5], [194.4, 123.3], [195.6, 113.4], [194.9, 104.4], [193.0, 96.5], [190.0, 88.8], [185.5, 80.7], [180.0, 73.2], [173.7, 66.5], [166.3, 60.7], [157.8, 56.0], [147.9, 53.0], [137.3, 52.1], [131.8, 52.5], [126.3, 53.3], [120.8, 54.7], [115.4, 56.5], [110.2, 58.5], [100.4, 63.2], [91.9, 68.8], [84.6, 75.0], [78.6, 81.7], [73.7, 88.8], [69.5, 97.5], [66.7, 106.8], [65.8, 115.2], [66.8, 123.9], [70.1, 133.4], [75.9, 142.7], [82.6, 149.5], [89.2, 154.3], [96.6, 158.2], [106.0, 161.6], [111.4, 162.9], [117.1, 163.6], [122.8, 163.7], [128.5, 163.0], [134.2, 161.6], [139.5, 159.7], [148.9, 154.7], [156.0, 148.5], [160.8, 140.4], [162.3, 130.7], [161.0, 121.6], [159.6, 117.8], [157.8, 115.1], [150.0, 110.0], [140.1, 106.6], [130.2, 105.9], [121.3, 107.6], [112.8, 111.8], [105.3, 117.5], [100.3, 124.2], [98.7, 128.0], [99.6, 130.9], [101.6, 133.4], [104.6, 135.3], [112.1, 137.2], [120.1, 137.8], [128.1, 137.1], [132.0, 136.4]])),
				duration: 620,
			},
			{ d: draw([[81.4, 51.3], [81.4, 56.3]]), duration: 110 },
			{ d: draw([[104.2, 47.4], [104.2, 53.6]]), duration: 110 },
			{
				// The beak: a small ▽ that the pen fills in, the tip a little to the right.
				d: draw([[89.8, 55.2], [96.8, 55.0]], [[94.0, 60.6]], [[89.8, 55.2]]),
				duration: 150,
			},
			{ d: draw(tick(70, 64.5, 3.5)), duration: 90 },
			{ d: draw(tick(121, 58.5, 3.5)), duration: 90 },
			{ d: draw(at([[140.8, 183.0], [139.4, 188.5], [138.3, 199.2], [138.5, 209.7], [138.8, 220.0], [139.1, 230.1], [139.6, 240.2], [139.7, 251.0], [139.9, 256.6], [140.3, 262.1]])), duration: 220 },
			{
				// Two leaves from the foot of the stem (box units), each a closed outline.
				d:
					draw([[105.3, 160.3], [96, 152], [86, 146.5], [77, 144.5], [70, 146]], [[71.5, 153], [79, 159], [90, 162.5], [100, 162.5], [105.3, 160.3]]) +
					draw([[105.3, 160.3], [107, 152], [112, 143], [120, 136], [130, 132], [138, 133]], [[138.5, 140], [133, 148], [123, 155], [113, 159.5], [105.3, 160.3]]),
				duration: 440,
			},
		];
	},
};

function maru(draw: Draw): Stroke[] {
	// Start near the top, go anticlockwise and overshoot a little, as Japanese teachers do.
	const points: Knot[] = [];
	const start = -Math.PI * 0.42;
	for (let t = 0; t <= Math.PI * 2.07; t += 0.15) {
		const a = start - t;
		const r = 74 - t * 1.4;
		points.push([100 + r * Math.cos(a) * 1.02, 102 + r * Math.sin(a) * 0.95]);
	}
	return [{ d: draw(points), duration: 520 }];
}

function sankaku(draw: Draw): Stroke[] {
	return [{ d: draw([[102, 26], [30, 158]], [[172, 160]], [[98, 30]]), duration: 560 }];
}

function batsu(draw: Draw): Stroke[] {
	return [
		{ d: draw([[44, 42], [99.5, 98.5], [158, 160]]), duration: 230 },
		{ d: draw([[156, 40], [101.5, 99.5], [42, 158]]), duration: 230 },
	];
}

/**
 * How to draw a mark: every mark with the same pen, swaying by hand. `style` picks the hanamaru
 * design and is ignored for other marks. Each call sways differently; pass `random` for a fixed one.
 */
export function markDrawing(mark: Mark, style: HanamaruStyle = "loop", random: () => number = Math.random): MarkDrawing {
	const draw = drawer(random);
	switch (mark) {
		case "hanamaru":
			return { strokes: HANAMARU[style](draw) };
		case "maru":
			return { strokes: maru(draw) };
		case "sankaku":
			return { strokes: sankaku(draw) };
		case "batsu":
			return { strokes: batsu(draw) };
	}
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** SVG for a mark; `extraWidth` thickens the pen for small icons. */
export function markSvg(drawing: MarkDrawing, viewBox: string, className: string, extraWidth = 0): { svg: SVGSVGElement; paths: SVGPathElement[] } {
	const svg = document.createElementNS(SVG_NS, "svg");
	svg.setAttribute("viewBox", viewBox);
	svg.setAttribute("class", className);
	svg.setAttribute("aria-hidden", "true");
	const paths = drawing.strokes.map((stroke) => {
		const element = document.createElementNS(SVG_NS, "path");
		element.setAttribute("d", stroke.d);
		element.setAttribute("fill", "none");
		element.setAttribute("stroke", RED_INK);
		element.setAttribute("stroke-width", String(STROKE_WIDTH + extraWidth));
		element.setAttribute("stroke-linecap", "round");
		element.setAttribute("stroke-linejoin", "round");
		svg.appendChild(element);
		return element;
	});
	return { svg, paths };
}

/** A finished mark as an inline SVG icon (lists). */
export function markIcon(mark: Mark, className: string, style: HanamaruStyle = "loop", random: () => number = Math.random): SVGSVGElement {
	return markSvg(markDrawing(mark, style, random), `-6 -6 ${MARK_BOX + 12} ${MARK_BOX + 12}`, className, 3).svg;
}

/** Draw a finished mark on a canvas (share images). */
export function paintMark(
	ctx: CanvasRenderingContext2D,
	mark: Mark,
	x: number,
	y: number,
	size: number,
	style?: HanamaruStyle,
	random: () => number = Math.random,
): void {
	ctx.save();
	ctx.translate(x, y);
	ctx.scale(size / MARK_BOX, size / MARK_BOX);
	ctx.strokeStyle = RED_INK;
	ctx.lineWidth = STROKE_WIDTH;
	ctx.lineCap = "round";
	ctx.lineJoin = "round";
	for (const stroke of markDrawing(mark, style, random).strokes) ctx.stroke(new Path2D(stroke.d));
	ctx.restore();
}
