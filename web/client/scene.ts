// Draws a problem scene on a canvas in a 1000×1000 coordinate space.
// Each seat is laid out as if it sat at the bottom, then rotated around the centre.

import type { Choice, Meld, Pai, ProblemKind, Scene } from "../shared/types";
import { BACK_URL, FRONT_URL, faceUrl, preloadTiles, tileImage } from "./tiles";

export const SCENE_SIZE = 1000;

const RIVER_W = 44;
const RIVER_H = 59;
const HAND_W = 66;
const HAND_H = 88;
const PANEL_HALF = 170;
const RIVER_Y = PANEL_HALF + 28;
const RIVER_X = -3 * RIVER_W;
const RIVER_ROW = 6;
const EDGE = SCENE_SIZE / 2;
const OPPONENT_ROW_HALF = 380; // keeps the three opponent rows clear of each other's corners
const SELF_ROW_HALF = 490;
const SELF_BOTTOM = SCENE_SIZE - 10;
const RAISE = 16; // a selected hand tile rises by this much

const COLORS = {
	felt: "#1b5741",
	feltEdge: "#123d2e",
	panel: "#0e2a21",
	panelLine: "#c9a45c",
	text: "#f1e8d0",
	dim: "#9fb8aa",
	accent: "#ffd166",
	oya: "#ff8f70",
	red: "#d62a1e",
};

const FONT = "'Zen Kaku Gothic New', 'Hiragino Sans', 'Noto Sans JP', sans-serif";
const WINDS = ["東", "南", "西", "北"];
const BAKAZE: Record<string, string> = { E: "東", S: "南", W: "西", N: "北" };
// Relative seat → rotation (0 bottom, 1 right, 2 top, 3 left).
const ROTATIONS = [0, -Math.PI / 2, Math.PI, Math.PI / 2];

export function questionText(kind: ProblemKind, choices: Choice[]): string {
	if (kind === "discard") return "何を切る？";
	if (kind === "riichi") return "リーチする？ 何を切る？";
	const chi = choices.some((c) => c.action.startsWith("chi"));
	const pon = choices.some((c) => c.action === "pon");
	return chi && pon ? "鳴く？" : chi ? "チーする？" : "ポンする？";
}

/** Load all tile images the scene needs. Call before drawScene. */
export function preloadScene(scene: Scene, choices: Choice[] = []): Promise<void> {
	const pais: Pai[] = [...scene.hand, ...scene.doraMarkers];
	if (scene.drawn) pais.push(scene.drawn);
	scene.rivers.forEach((river) => river.forEach((t) => pais.push(t.pai)));
	scene.melds.forEach((melds) => melds.forEach((m) => pais.push(...meldTiles(m, 0).map((t) => t.pai))));
	choices.forEach((c) => c.consumed && pais.push(...c.consumed));
	if (scene.target) pais.push(scene.target.pai);
	return preloadTiles(pais);
}

// ---- own hand (shared by drawing, tapping and the evaluation bars) ----

/** A tile of the answering player's concealed hand, in scene coordinates (top-left, size). */
export interface HandSlot {
	/** Index in [...hand, drawn]. */
	index: number;
	pai: Pai;
	x: number;
	y: number;
	w: number;
	h: number;
}

export function handTiles(scene: Scene): Pai[] {
	return scene.drawn ? [...scene.hand, scene.drawn] : [...scene.hand];
}

export function handSlots(scene: Scene): HandSlot[] {
	const melds = scene.melds[scene.seat];
	const tiles = handTiles(scene);
	const drawGap = scene.drawn ? HAND_W * 0.25 : 0;
	const natural = tiles.length * HAND_W + drawGap + HAND_W * 0.4 + meldsTotalWidth(melds, scene.seat, HAND_W, HAND_H);
	const scale = Math.min(1, (2 * SELF_ROW_HALF) / natural);
	const w = HAND_W * scale;
	const h = HAND_H * scale;
	return tiles.map((pai, index) => ({
		index,
		pai,
		x: EDGE - SELF_ROW_HALF + index * w + (scene.drawn && index === tiles.length - 1 ? drawGap * scale : 0),
		y: SELF_BOTTOM - h,
		w,
		h,
	}));
}

/** The hand tile under a point in scene coordinates (generous upward, for fingers). */
export function handSlotAt(scene: Scene, x: number, y: number): number | null {
	const slot = handSlots(scene).find((s) => x >= s.x && x < s.x + s.w && y >= s.y - 60 && y <= s.y + s.h + 10);
	return slot ? slot.index : null;
}

/** Interaction and result state of the own hand. */
export interface HandView {
	selected: number | null;
	/** Per slot; false dims a tile that cannot be chosen now. */
	enabled?: boolean[];
	/** Evaluation bars shown above the hand after answering. */
	bars?: HandBar[];
	/** Growth of the bars, 0-1. */
	barProgress?: number;
}

export interface HandBar {
	/** AI evaluation of discarding this tile without riichi (0-1), if legal. */
	dama?: number;
	/** AI evaluation of riichi with this tile, if legal. */
	riichi?: number;
	best: boolean;
}

export interface SceneOptions {
	problemId: number;
	hand?: HandView;
}

/** Draw into a square of `size` pixels at the current origin. Tiles must be preloaded. */
export function drawScene(ctx: CanvasRenderingContext2D, scene: Scene, size: number, options: SceneOptions): void {
	ctx.save();
	ctx.scale(size / SCENE_SIZE, size / SCENE_SIZE);
	drawFelt(ctx);
	ctx.save();
	ctx.translate(EDGE, EDGE);
	for (let relative = 0; relative < 4; relative++) {
		const seat = (scene.seat + relative) % 4;
		ctx.save();
		ctx.rotate(ROTATIONS[relative]);
		if (scene.riichi[seat]) drawRiichi(ctx);
		drawRiver(ctx, scene, seat);
		if (relative > 0) drawOpponentRow(ctx, scene, seat);
		ctx.restore();
	}
	drawPanel(ctx, scene);
	ctx.restore();
	drawOwnRow(ctx, scene, options.hand);
	if (options.hand?.bars) drawBars(ctx, scene, options.hand.bars, options.hand.barProgress ?? 1);
	drawCornerLabel(ctx, options.problemId);
	ctx.restore();
}

function drawFelt(ctx: CanvasRenderingContext2D): void {
	const gradient = ctx.createRadialGradient(EDGE, EDGE, 80, EDGE, EDGE, EDGE * 1.45);
	gradient.addColorStop(0, COLORS.felt);
	gradient.addColorStop(1, COLORS.feltEdge);
	ctx.fillStyle = gradient;
	ctx.fillRect(0, 0, SCENE_SIZE, SCENE_SIZE);
}

// ---- tiles ----

interface TileOptions {
	back?: boolean;
	sideways?: boolean;
	dim?: boolean;
	highlight?: boolean;
	selected?: boolean;
}

/** Draw a tile whose bounding box (after rotation) has its top-left at (x, y). */
function drawTile(ctx: CanvasRenderingContext2D, pai: Pai | null, x: number, y: number, w: number, h: number, o: TileOptions = {}): void {
	const boxW = o.sideways ? h : w;
	const boxH = o.sideways ? w : h;
	ctx.save();
	ctx.translate(x + boxW / 2, y + boxH / 2);
	if (o.sideways) ctx.rotate(-Math.PI / 2);
	ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
	ctx.shadowBlur = w * 0.08;
	ctx.shadowOffsetY = w * 0.04;
	ctx.drawImage(tileImage(o.back || !pai ? BACK_URL : FRONT_URL), -w / 2, -h / 2, w, h);
	ctx.shadowColor = "transparent";
	if (!o.back && pai) ctx.drawImage(tileImage(faceUrl(pai)), -w / 2, -h / 2, w, h);
	if (o.back || !pai) {
		ctx.fillStyle = "rgba(30, 38, 34, 0.5)"; // tone the bright back down so rivers stay the focus
		roundRect(ctx, -w / 2, -h / 2, w, h, w * 0.12);
		ctx.fill();
	}
	if (o.dim) {
		ctx.fillStyle = "rgba(20, 30, 28, 0.36)";
		roundRect(ctx, -w / 2, -h / 2, w, h, w * 0.12);
		ctx.fill();
	}
	if (o.highlight || o.selected) {
		const color = o.selected ? COLORS.red : COLORS.accent;
		ctx.strokeStyle = color;
		ctx.lineWidth = o.selected ? 5 : 4;
		ctx.shadowColor = color;
		ctx.shadowBlur = 14;
		roundRect(ctx, -w / 2 - 3, -h / 2 - 3, w + 6, h + 6, w * 0.16);
		ctx.stroke();
	}
	ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
	ctx.beginPath();
	ctx.roundRect(x, y, w, h, r);
}

// ---- rivers and riichi ----

function drawRiver(ctx: CanvasRenderingContext2D, scene: Scene, seat: number): void {
	const river = scene.rivers[seat];
	const isTarget = scene.target?.actor === seat;
	let sidewaysPending = false;
	let slot = 0;
	let x = RIVER_X;
	river.forEach((tile, index) => {
		// A called tile leaves the river; a called riichi tile passes its sideways mark on.
		if (tile.called) {
			sidewaysPending ||= tile.riichi;
			return;
		}
		const sideways = tile.riichi || sidewaysPending;
		sidewaysPending = false;
		// Rows of six; the third row takes the rest.
		const row = Math.min(Math.floor(slot / RIVER_ROW), 2);
		if (slot === RIVER_ROW || slot === 2 * RIVER_ROW) x = RIVER_X;
		const y = RIVER_Y + row * RIVER_H;
		const width = sideways ? RIVER_H : RIVER_W;
		drawTile(ctx, tile.pai, x, sideways ? y + (RIVER_H - RIVER_W) : y, RIVER_W, RIVER_H, {
			sideways,
			dim: tile.tsumogiri,
			highlight: isTarget && index === river.length - 1,
		});
		x += width;
		slot++;
	});
}

/** A riichi player: a lit stick, a label, and a red wash under the river. */
function drawRiichi(ctx: CanvasRenderingContext2D): void {
	ctx.fillStyle = "rgba(214, 42, 30, 0.3)";
	roundRect(ctx, RIVER_X - 10, RIVER_Y - 8, RIVER_W * 6 + 20, RIVER_H * 3 + 16, 12);
	ctx.fill();
	ctx.strokeStyle = "rgba(255, 120, 100, 0.7)";
	ctx.lineWidth = 3;
	ctx.stroke();

	const w = 150;
	const h = 13;
	const y = PANEL_HALF + 8;
	ctx.save();
	ctx.shadowColor = COLORS.accent;
	ctx.shadowBlur = 16;
	ctx.fillStyle = "#fbf8ef";
	roundRect(ctx, -w / 2, y, w, h, h / 2);
	ctx.fill();
	ctx.restore();
	ctx.fillStyle = COLORS.red;
	ctx.beginPath();
	ctx.arc(0, y + h / 2, 4, 0, Math.PI * 2);
	ctx.fill();

	ctx.fillStyle = COLORS.red;
	roundRect(ctx, w / 2 + 10, y - 7, 74, 27, 6);
	ctx.fill();
	ctx.fillStyle = "#fff6ea";
	ctx.font = `700 18px ${FONT}`;
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillText("リーチ", w / 2 + 47, y + 7);
}

// ---- hands and melds ----

interface MeldTile {
	pai: Pai;
	sideways?: boolean;
	back?: boolean;
	/** Stacked on top of the sideways tile (kakan). */
	stacked?: boolean;
}

/** Tiles of a meld from left to right as seen by its owner. */
export function meldTiles(meld: Meld, owner: number): MeldTile[] {
	const from = meld.target === undefined ? 0 : (meld.target - owner + 4) % 4; // 1 right, 2 across, 3 left
	if (meld.type === "ankan") {
		return meld.consumed.map((pai, i) => ({ pai, back: i === 0 || i === 3 }));
	}
	const called = meld.pai as Pai;
	const own = [...meld.consumed];
	const tiles: MeldTile[] = own.map((pai) => ({ pai }));
	const position = from === 3 ? 0 : from === 2 ? 1 : tiles.length;
	tiles.splice(position, 0, { pai: called, sideways: true });
	if (meld.type === "kakan" && meld.added) tiles.splice(position + 1, 0, { pai: meld.added, sideways: true, stacked: true });
	return tiles;
}

function meldWidth(tiles: MeldTile[], w: number, h: number): number {
	return tiles.reduce((sum, t) => sum + (t.stacked ? 0 : t.sideways ? h : w), 0);
}

/** Draw melds right-aligned so that the last one ends at `right`; tiles sit on `bottom`. */
function drawMelds(ctx: CanvasRenderingContext2D, melds: Meld[], owner: number, right: number, bottom: number, w: number, h: number): void {
	let x = right;
	for (const meld of melds.slice().reverse()) {
		const tiles = meldTiles(meld, owner);
		x -= meldWidth(tiles, w, h);
		let cursor = x;
		for (const tile of tiles) {
			if (tile.stacked) {
				drawTile(ctx, tile.pai, cursor - h, bottom - 2 * w, w, h, { sideways: true });
				continue;
			}
			const tileW = tile.sideways ? h : w;
			const tileH = tile.sideways ? w : h;
			drawTile(ctx, tile.pai, cursor, bottom - tileH, w, h, { sideways: tile.sideways, back: tile.back });
			cursor += tileW;
		}
		x -= w * 0.2;
	}
}

function meldsTotalWidth(melds: Meld[], owner: number, w: number, h: number): number {
	return melds.reduce((sum, m) => sum + meldWidth(meldTiles(m, owner), w, h) + w * 0.2, 0);
}

function drawOwnRow(ctx: CanvasRenderingContext2D, scene: Scene, view?: HandView): void {
	const slots = handSlots(scene);
	for (const slot of slots) {
		const selected = view?.selected === slot.index;
		drawTile(ctx, slot.pai, slot.x, slot.y - (selected ? RAISE : 0), slot.w, slot.h, {
			selected,
			dim: view?.enabled ? !view.enabled[slot.index] : false,
		});
	}
	const { w, h } = slots[0] ?? { w: HAND_W, h: HAND_H };
	drawMelds(ctx, scene.melds[scene.seat], scene.seat, EDGE + SELF_ROW_HALF, SELF_BOTTOM, w, h);
}

function drawOpponentRow(ctx: CanvasRenderingContext2D, scene: Scene, seat: number): void {
	const melds = scene.melds[seat];
	const concealed = scene.concealedCounts[seat];
	const natural = concealed * RIVER_W + RIVER_W * 0.4 + meldsTotalWidth(melds, seat, RIVER_W, RIVER_H);
	const scale = Math.min(1, (2 * OPPONENT_ROW_HALF) / natural);
	const w = RIVER_W * scale;
	const h = RIVER_H * scale;
	const bottom = EDGE - 8;
	for (let i = 0; i < concealed; i++) drawTile(ctx, null, -OPPONENT_ROW_HALF + i * w, bottom - h, w, h, { back: true });
	drawMelds(ctx, melds, seat, OPPONENT_ROW_HALF, bottom, w, h);
}

// ---- evaluation bars ----

const BAR_MAX = 250;

/** AI evaluation of each hand tile as bars rising from the hand (after answering). */
function drawBars(ctx: CanvasRenderingContext2D, scene: Scene, bars: HandBar[], progress: number): void {
	const slots = handSlots(scene);
	// Bars stand on the hand and grow upward over the player's own river.
	const base = slots[0].y - RAISE - 8;
	const hasRiichi = bars.some((b) => b?.riichi !== undefined);
	const top = base - BAR_MAX - (hasRiichi ? 70 : 40);
	ctx.fillStyle = "rgba(6, 20, 15, 0.74)";
	roundRect(ctx, 6, top, SCENE_SIZE - 12, base - top + 6, 14);
	ctx.fill();
	if (hasRiichi) {
		ctx.font = `700 18px ${FONT}`;
		ctx.textAlign = "left";
		ctx.textBaseline = "middle";
		ctx.fillStyle = COLORS.text;
		ctx.fillText("■ ダマ", 24, top + 20);
		ctx.fillStyle = "#ff9f43";
		ctx.fillText("■ リーチ", 104, top + 20);
	}
	ctx.textAlign = "center";
	ctx.textBaseline = "alphabetic";
	for (const slot of slots) {
		const bar = bars[slot.index];
		if (!bar) continue;
		const columns: { value: number; color: string }[] = [];
		if (bar.dama !== undefined) columns.push({ value: bar.dama, color: bar.best && !(bar.riichi !== undefined && bar.riichi > bar.dama) ? COLORS.red : "#efe7cf" });
		if (bar.riichi !== undefined) columns.push({ value: bar.riichi, color: bar.best && bar.riichi >= (bar.dama ?? 0) ? COLORS.red : "#ff9f43" });
		const width = (slot.w * 0.62) / columns.length;
		let tallest = 0;
		columns.forEach((column, i) => {
			const x = slot.x + slot.w * 0.19 + i * width;
			const height = Math.max(3, column.value * BAR_MAX * progress);
			tallest = Math.max(tallest, height);
			ctx.fillStyle = column.color;
			roundRect(ctx, x, base - height, width - 3, height, 3);
			ctx.fill();
		});
		if (progress < 1) continue;
		// Labels stack above the taller bar, in the bars' order (dama on top).
		const labels = columns.filter((column) => column.value >= 0.02);
		labels.forEach((column, i) => {
			ctx.fillStyle = column.color === COLORS.red ? "#ffb4a8" : column.color;
			ctx.font = `700 ${columns.length > 1 ? 18 : 22}px ${FONT}`;
			ctx.fillText(`${Math.round(column.value * 100)}%`, slot.x + slot.w / 2, base - tallest - 8 - (labels.length - 1 - i) * 21);
		});
	}
}

// ---- centre panel ----

function drawPanel(ctx: CanvasRenderingContext2D, scene: Scene): void {
	ctx.fillStyle = COLORS.panel;
	roundRect(ctx, -PANEL_HALF, -PANEL_HALF, PANEL_HALF * 2, PANEL_HALF * 2, 20);
	ctx.fill();
	ctx.strokeStyle = COLORS.panelLine;
	ctx.lineWidth = 2;
	roundRect(ctx, -PANEL_HALF + 7, -PANEL_HALF + 7, PANEL_HALF * 2 - 14, PANEL_HALF * 2 - 14, 14);
	ctx.stroke();

	ctx.textBaseline = "middle";
	ctx.textAlign = "center";
	ctx.fillStyle = COLORS.text;
	ctx.font = `700 46px ${FONT}`;
	const round = `${BAKAZE[scene.bakaze]}${scene.kyoku}局`;
	if (scene.honba > 0) {
		const roundWidth = ctx.measureText(round).width;
		ctx.font = `700 24px ${FONT}`;
		const honba = `${scene.honba}本場`;
		const total = roundWidth + 10 + ctx.measureText(honba).width;
		ctx.textAlign = "left";
		ctx.font = `700 46px ${FONT}`;
		ctx.fillText(round, -total / 2, -62);
		ctx.font = `700 24px ${FONT}`;
		ctx.fillText(honba, -total / 2 + roundWidth + 10, -56);
	} else {
		ctx.fillText(round, 0, -62);
	}

	const doraW = 36;
	const count = scene.doraMarkers.length;
	ctx.textAlign = "right";
	ctx.fillStyle = COLORS.dim;
	ctx.font = `700 16px ${FONT}`;
	const doraLeft = -(count * doraW) / 2;
	ctx.fillText("ドラ", doraLeft - 8, 6);
	scene.doraMarkers.forEach((pai, i) => drawTile(ctx, pai, doraLeft + i * doraW, -18, doraW, doraW * (4 / 3)));

	ctx.textAlign = "center";
	ctx.font = `500 22px ${FONT}`;
	ctx.fillText(`残り${scene.tilesLeft}${scene.kyotaku > 0 ? `　供託${scene.kyotaku}` : ""}`, 0, 64);

	// Each seat's score faces that seat, as on an automatic table.
	for (let relative = 0; relative < 4; relative++) {
		const seat = (scene.seat + relative) % 4;
		const wind = (seat - scene.oya + 4) % 4;
		ctx.save();
		ctx.rotate(ROTATIONS[relative]);
		ctx.font = `700 28px ${FONT}`;
		const score = scene.scores[seat].toLocaleString("en-US");
		const scoreWidth = ctx.measureText(score).width;
		ctx.textAlign = "left";
		ctx.fillStyle = wind === 0 ? COLORS.oya : COLORS.text;
		ctx.fillText(WINDS[wind], -(scoreWidth + 40) / 2, 138);
		ctx.fillStyle = COLORS.text;
		ctx.fillText(score, -(scoreWidth + 40) / 2 + 40, 138);
		ctx.restore();
	}
}

function drawCornerLabel(ctx: CanvasRenderingContext2D, problemId: number): void {
	ctx.textAlign = "left";
	ctx.textBaseline = "top";
	ctx.fillStyle = COLORS.panelLine;
	ctx.font = `700 15px ${FONT}`;
	ctx.fillText("第", 26, 24);
	ctx.font = `700 30px ${FONT}`;
	ctx.fillText(String(problemId), 26, 44);
	ctx.font = `700 15px ${FONT}`;
	ctx.fillText("問", 26, 80);
}
