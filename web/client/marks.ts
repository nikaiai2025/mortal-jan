// Red-pen marks drawn stroke by stroke (回答後の演出). Paths live in a 200×200 box.

import type { Mark } from "../shared/rules";

export interface Stroke {
	d: string;
	/** Drawing time in ms at normal speed. */
	duration: number;
}

export const MARK_BOX = 200;
export const RED_INK = "#d62a1e";
export const STROKE_WIDTH = 9;

type Point = [number, number];

function path(points: Point[]): string {
	return points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
}

/** A small deterministic wobble so that lines look hand-drawn. */
const wobble = (t: number, seed: number) => Math.sin(t * 7.3 + seed) * 0.9 + Math.sin(t * 2.1 + seed * 3) * 1.3;

function hanamaru(): Stroke[] {
	// 1. Spiral from the centre outwards (anticlockwise on screen).
	const spiral: Point[] = [];
	const turns = 2.2 * Math.PI;
	for (let a = 0; a <= turns; a += 0.12) {
		const r = 5 + (a / turns) * 33;
		spiral.push([100 + r * Math.cos(-a - 1.2), 100 + r * Math.sin(-a - 1.2)]);
	}
	// 2. Looping petals around it: a big circle with a fast small circle on top.
	const petals: Point[] = [];
	const loops = 8;
	const start = -turns - 1.2;
	for (let t = 0; t <= 2 * Math.PI + 0.35; t += 0.02) {
		const a = start - t;
		const b = start - t * loops - Math.PI;
		const R = 68 + wobble(t, 1) * 0.6;
		petals.push([100 + R * Math.cos(a) + 22 * Math.cos(b), 100 + R * Math.sin(a) + 22 * Math.sin(b)]);
	}
	return [
		{ d: path(spiral), duration: 420 },
		{ d: path(petals), duration: 900 },
	];
}

function maru(): Stroke[] {
	// Start near the top, go anticlockwise and overshoot a little, as Japanese teachers do.
	const points: Point[] = [];
	const start = -Math.PI * 0.42;
	for (let t = 0; t <= Math.PI * 2.07; t += 0.04) {
		const a = start - t;
		const r = 74 - t * 1.4 + wobble(t, 2);
		points.push([100 + r * Math.cos(a) * 1.02, 102 + r * Math.sin(a) * 0.95]);
	}
	return [{ d: path(points), duration: 520 }];
}

function sankaku(): Stroke[] {
	const corners: Point[] = [
		[102, 26],
		[30, 158],
		[172, 160],
		[98, 30],
	];
	const points: Point[] = [];
	for (let i = 0; i < corners.length - 1; i++) {
		const [x0, y0] = corners[i];
		const [x1, y1] = corners[i + 1];
		for (let t = 0; t <= 1; t += 0.05) points.push([x0 + (x1 - x0) * t + wobble(t + i, 3), y0 + (y1 - y0) * t + wobble(t + i, 4)]);
	}
	return [{ d: path(points), duration: 560 }];
}

function batsu(): Stroke[] {
	return [
		{ d: "M44 42 Q98 96 158 160", duration: 230 },
		{ d: "M156 40 Q104 100 42 158", duration: 230 },
	];
}

export function markStrokes(mark: Mark): Stroke[] {
	switch (mark) {
		case "hanamaru":
			return hanamaru();
		case "maru":
			return maru();
		case "sankaku":
			return sankaku();
		case "batsu":
			return batsu();
	}
}

/** A finished mark as an inline SVG icon (lists). */
export function markIcon(mark: Mark, className: string): SVGSVGElement {
	const ns = "http://www.w3.org/2000/svg";
	const svg = document.createElementNS(ns, "svg");
	svg.setAttribute("viewBox", `-6 -6 ${MARK_BOX + 12} ${MARK_BOX + 12}`);
	svg.setAttribute("class", className);
	svg.setAttribute("aria-hidden", "true");
	for (const stroke of markStrokes(mark)) {
		const path = document.createElementNS(ns, "path");
		path.setAttribute("d", stroke.d);
		path.setAttribute("fill", "none");
		path.setAttribute("stroke", RED_INK);
		path.setAttribute("stroke-width", String(STROKE_WIDTH + 3));
		path.setAttribute("stroke-linecap", "round");
		path.setAttribute("stroke-linejoin", "round");
		svg.appendChild(path);
	}
	return svg;
}

/** Draw a finished mark on a canvas (share images). */
export function paintMark(ctx: CanvasRenderingContext2D, mark: Mark, x: number, y: number, size: number): void {
	ctx.save();
	ctx.translate(x, y);
	ctx.scale(size / MARK_BOX, size / MARK_BOX);
	ctx.strokeStyle = RED_INK;
	ctx.lineWidth = STROKE_WIDTH;
	ctx.lineCap = "round";
	ctx.lineJoin = "round";
	for (const stroke of markStrokes(mark)) ctx.stroke(new Path2D(stroke.d));
	ctx.restore();
}
