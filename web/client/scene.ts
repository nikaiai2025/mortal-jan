// Draws a problem scene on a canvas in a 1000×1000 coordinate space.
// Each seat is laid out as if it sat at the bottom, then rotated around the centre.

import type { Choice, Meld, Pai, ProblemKind, Scene } from "../shared/types";
import { BACK_URL, FRONT_URL, faceUrl, preloadTiles, tileImage } from "./tiles";

/** The table is a square of SCENE_WIDTH; below it a strip holds the own hand, so the evaluation bars fit between the own river and the hand. */
export const SCENE_WIDTH = 1000;
export const SCENE_HEIGHT = 1068;

const RIVER_W = 44;
const RIVER_H = 59;
const HAND_W = 66;
const HAND_H = 88;
// The centre panel is wider than tall: the side players' scores stand upright in it.
const PANEL_HALF_X = 175;
const PANEL_HALF_Y = 105;
const RIVER_GAP = 26; // room for a riichi stick between the panel and a river
const RIVER_X = -3 * RIVER_W;
const RIVER_ROW = 6;
const EDGE = SCENE_WIDTH / 2; // the table's centre, on both axes
const OPPONENT_ROW_HALF = 320; // keeps the side rows clear of the corners and of the evaluation bars
const SELF_ROW_HALF = 490;
const SELF_BOTTOM = SCENE_HEIGHT - 11;
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

/** Draw `width` pixels wide (and width × SCENE_HEIGHT / SCENE_WIDTH tall) at the current origin. Tiles must be preloaded. */
export function drawScene(ctx: CanvasRenderingContext2D, scene: Scene, width: number, options: SceneOptions): void {
	ctx.save();
	ctx.scale(width / SCENE_WIDTH, width / SCENE_WIDTH);
	drawFelt(ctx);
	ctx.save();
	ctx.translate(EDGE, EDGE);
	for (let relative = 0; relative < 4; relative++) {
		const seat = (scene.seat + relative) % 4;
		ctx.save();
		ctx.rotate(ROTATIONS[relative]);
		// Distance from the centre to the panel's edge on this seat's side.
		const panelEdge = relative % 2 === 0 ? PANEL_HALF_Y : PANEL_HALF_X;
		if (scene.riichi[seat]) drawRiichi(ctx, panelEdge);
		drawRiver(ctx, scene, seat, panelEdge + RIVER_GAP);
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
	ctx.fillRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT);
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

function drawRiver(ctx: CanvasRenderingContext2D, scene: Scene, seat: number, riverY: number): void {
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
		const y = riverY + row * RIVER_H;
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
function drawRiichi(ctx: CanvasRenderingContext2D, panelEdge: number): void {
	const riverY = panelEdge + RIVER_GAP;
	ctx.fillStyle = "rgba(214, 42, 30, 0.3)";
	roundRect(ctx, RIVER_X - 10, riverY - 8, RIVER_W * 6 + 20, RIVER_H * 3 + 16, 12);
	ctx.fill();
	ctx.strokeStyle = "rgba(255, 120, 100, 0.7)";
	ctx.lineWidth = 3;
	ctx.stroke();

	const w = 150;
	const h = 13;
	const y = panelEdge + 8;
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

const BAR_MAX = 83;

/** AI evaluation of each hand tile as bars rising from the hand into the strip below the own river (after answering). */
function drawBars(ctx: CanvasRenderingContext2D, scene: Scene, bars: HandBar[], progress: number): void {
	const slots = handSlots(scene);
	// Clear of a selected tile, which rises by RAISE.
	const base = slots[0].y - RAISE - 12;
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
			ctx.font = `700 ${columns.length > 1 ? 15 : 19}px ${FONT}`;
			ctx.fillText(`${Math.round(column.value * 100)}%`, slot.x + slot.w / 2, base - tallest - 6 - (labels.length - 1 - i) * 16);
		});
	}
}

// ---- centre panel ----

function drawPanel(ctx: CanvasRenderingContext2D, scene: Scene): void {
	ctx.fillStyle = COLORS.panel;
	roundRect(ctx, -PANEL_HALF_X, -PANEL_HALF_Y, PANEL_HALF_X * 2, PANEL_HALF_Y * 2, 16);
	ctx.fill();
	ctx.strokeStyle = COLORS.panelLine;
	ctx.lineWidth = 2;
	roundRect(ctx, -PANEL_HALF_X + 6, -PANEL_HALF_Y + 6, PANEL_HALF_X * 2 - 12, PANEL_HALF_Y * 2 - 12, 11);
	ctx.stroke();

	drawRound(ctx, scene, -40);
	drawDeadWall(ctx, scene, -14);
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillStyle = COLORS.dim;
	ctx.font = `500 17px ${FONT}`;
	ctx.fillText(`残り${scene.tilesLeft}`, 0, 36);

	// Every score stands upright, on its player's side: one line above and below, two lines left and right.
	const sides: [relative: number, x: number, y: number][] = [
		[0, 0, PANEL_HALF_Y - 24],
		[1, PANEL_HALF_X - 56, 0],
		[2, 0, -(PANEL_HALF_Y - 24)],
		[3, -(PANEL_HALF_X - 56), 0],
	];
	for (const [relative, x, y] of sides) {
		const seat = (scene.seat + relative) % 4;
		const wind = WINDS[(seat - scene.oya + 4) % 4];
		const windColor = seat === scene.oya ? COLORS.oya : COLORS.text;
		const score = scene.scores[seat].toLocaleString("en-US");
		ctx.textBaseline = "middle";
		ctx.font = `800 28px ${FONT}`;
		if (relative % 2 === 0) {
			const scoreWidth = ctx.measureText(score).width;
			ctx.font = `700 24px ${FONT}`;
			const windWidth = ctx.measureText(wind).width + 8;
			const left = x - (windWidth + scoreWidth) / 2;
			ctx.textAlign = "left";
			ctx.fillStyle = windColor;
			ctx.fillText(wind, left, y);
			ctx.font = `800 28px ${FONT}`;
			ctx.fillStyle = COLORS.text;
			ctx.fillText(score, left + windWidth, y);
		} else {
			ctx.textAlign = "center";
			ctx.fillStyle = COLORS.text;
			ctx.fillText(score, x, y + 16);
			ctx.font = `700 24px ${FONT}`;
			ctx.fillStyle = windColor;
			ctx.fillText(wind, x, y - 16);
		}
	}
}

/** "東1局" in a framed box; beside it the deposited 1000-point sticks and the honba (100-point sticks). */
function drawRound(ctx: CanvasRenderingContext2D, scene: Scene, y: number): void {
	const label = `${BAKAZE[scene.bakaze]}${scene.kyoku}局`;
	ctx.font = `800 22px ${FONT}`;
	const boxW = ctx.measureText(label).width + 14;
	const boxH = 36;
	const left = -(boxW + 8 + 62) / 2;
	ctx.fillStyle = "#121b18";
	roundRect(ctx, left, y - boxH / 2, boxW, boxH, 7);
	ctx.fill();
	ctx.strokeStyle = "#e9e2cf";
	ctx.lineWidth = 2;
	ctx.stroke();
	ctx.fillStyle = COLORS.text;
	ctx.textAlign = "left";
	ctx.textBaseline = "middle";
	ctx.fillText(label, left + 8, y + 1);

	const x = left + boxW + 8;
	ctx.font = `700 16px ${FONT}`;
	for (const [kind, count, dy] of [["thousand", scene.kyotaku, -9], ["hundred", scene.honba, 9]] as const) {
		drawStick(ctx, x, y + dy, kind);
		ctx.fillStyle = COLORS.text;
		ctx.fillText(String(count), x + 44, y + dy + 1);
	}
}

/** A point stick: 1000 has one red dot, 100 a small cluster of black dots. */
function drawStick(ctx: CanvasRenderingContext2D, x: number, centre: number, kind: "thousand" | "hundred"): void {
	const w = 38;
	const h = 7;
	ctx.fillStyle = "#f4f1e8";
	roundRect(ctx, x, centre - h / 2, w, h, 3);
	ctx.fill();
	ctx.fillStyle = kind === "thousand" ? COLORS.red : "#222";
	const dots: [number, number][] = kind === "thousand" ? [[0, 0]] : [-3.2, 0, 3.2].flatMap((dx): [number, number][] => [[dx, -1.4], [dx, 1.4]]);
	for (const [dx, dy] of dots) {
		ctx.beginPath();
		ctx.arc(x + w / 2 + dx, centre + dy, kind === "thousand" ? 2.3 : 1, 0, Math.PI * 2);
		ctx.fill();
	}
}

/** The dead wall's five tiles: the dora indicators face up from the left (one more per kan), the rest face down. */
function drawDeadWall(ctx: CanvasRenderingContext2D, scene: Scene, top: number): void {
	const w = 27;
	const h = 36;
	const left = -(5 * w + 4) / 2;
	for (let i = 0; i < 5; i++) {
		const pai = scene.doraMarkers[i] ?? null;
		drawTile(ctx, pai, left + i * (w + 1), top, w, h, { back: !pai });
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
