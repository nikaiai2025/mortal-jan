// Draws a problem scene on a canvas in a 1000×1000 coordinate space.
// Each seat is laid out as if it sat at the bottom, then rotated around the centre.

import type { Choice, Meld, Pai, ProblemKind, Scene } from "../shared/types";
import { BACK_URL, FRONT_URL, faceUrl, preloadTiles, tileImage } from "./tiles";

export const SCENE_SIZE = 1000;

const RIVER_W = 44;
const RIVER_H = 59;
const HAND_W = 60;
const HAND_H = 80;
const PANEL_HALF = 180;
const RIVER_Y = PANEL_HALF + 26;
const RIVER_X = -3 * RIVER_W;
const RIVER_ROW = 6;
const EDGE = SCENE_SIZE / 2;
const OPPONENT_ROW_HALF = 380; // keeps the three opponent rows clear of each other's corners
const SELF_ROW_HALF = 490;

const COLORS = {
	felt: "#1b5741",
	feltEdge: "#123d2e",
	panel: "#0e2a21",
	panelLine: "#c9a45c",
	text: "#f1e8d0",
	dim: "#9fb8aa",
	accent: "#ffd166",
	oya: "#ff8f70",
};

const FONT = "'Zen Kaku Gothic New', 'Hiragino Sans', 'Noto Sans JP', sans-serif";
const WINDS = ["東", "南", "西", "北"];
const BAKAZE: Record<string, string> = { E: "東", S: "南", W: "西", N: "北" };
// Relative seat → rotation (0 bottom, 1 right, 2 top, 3 left).
const ROTATIONS = [0, -Math.PI / 2, Math.PI, Math.PI / 2];

export function questionText(kind: ProblemKind, choices: Choice[], short = false): string {
	if (kind === "discard") return short ? "何切る？" : "何を切る？";
	if (kind === "riichi") return short ? "リーチ？何切る？" : "リーチする？ 何を切る？";
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

export interface SceneOptions {
	problemId: number;
	kind: ProblemKind;
	choices: Choice[];
}

/** Draw into a square of `size` pixels at the current origin. Tiles must be preloaded. */
export function drawScene(ctx: CanvasRenderingContext2D, scene: Scene, size: number, options: SceneOptions): void {
	ctx.save();
	ctx.scale(size / SCENE_SIZE, size / SCENE_SIZE);
	drawFelt(ctx);
	ctx.translate(EDGE, EDGE);
	for (let relative = 0; relative < 4; relative++) {
		const seat = (scene.seat + relative) % 4;
		ctx.save();
		ctx.rotate(ROTATIONS[relative]);
		drawRiver(ctx, scene, seat);
		if (scene.riichi[seat]) drawRiichiStick(ctx);
		if (relative === 0) drawOwnRow(ctx, scene);
		else drawOpponentRow(ctx, scene, seat);
		ctx.restore();
	}
	drawPanel(ctx, scene, options);
	ctx.restore();
	drawCornerLabel(ctx, size, options.problemId);
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
		ctx.fillStyle = "rgba(20, 30, 28, 0.32)";
		roundRect(ctx, -w / 2, -h / 2, w, h, w * 0.12);
		ctx.fill();
	}
	if (o.highlight) {
		ctx.strokeStyle = COLORS.accent;
		ctx.lineWidth = 4;
		ctx.shadowColor = COLORS.accent;
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

// ---- rivers ----

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

function drawRiichiStick(ctx: CanvasRenderingContext2D): void {
	const w = 120;
	const h = 10;
	const y = PANEL_HALF + 9;
	ctx.fillStyle = "#f4f1e8";
	roundRect(ctx, -w / 2, y, w, h, h / 2);
	ctx.fill();
	ctx.fillStyle = "#d62a1e";
	ctx.beginPath();
	ctx.arc(0, y + h / 2, 3.2, 0, Math.PI * 2);
	ctx.fill();
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

function drawOwnRow(ctx: CanvasRenderingContext2D, scene: Scene): void {
	const melds = scene.melds[scene.seat];
	const handCount = scene.hand.length + (scene.drawn ? 1 : 0);
	const natural = handCount * HAND_W + (scene.drawn ? HAND_W * 0.25 : 0) + HAND_W * 0.4 + meldsTotalWidth(melds, scene.seat, HAND_W, HAND_H);
	const scale = Math.min(1, (2 * SELF_ROW_HALF) / natural);
	const w = HAND_W * scale;
	const h = HAND_H * scale;
	const bottom = EDGE - 10;
	let x = -SELF_ROW_HALF;
	for (const pai of scene.hand) {
		drawTile(ctx, pai, x, bottom - h, w, h);
		x += w;
	}
	if (scene.drawn) drawTile(ctx, scene.drawn, x + w * 0.25, bottom - h, w, h);
	drawMelds(ctx, melds, scene.seat, SELF_ROW_HALF, bottom, w, h);
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

// ---- centre panel ----

function drawPanel(ctx: CanvasRenderingContext2D, scene: Scene, options: SceneOptions): void {
	ctx.fillStyle = COLORS.panel;
	roundRect(ctx, -PANEL_HALF, -PANEL_HALF, PANEL_HALF * 2, PANEL_HALF * 2, 20);
	ctx.fill();
	ctx.strokeStyle = COLORS.panelLine;
	ctx.lineWidth = 2;
	roundRect(ctx, -PANEL_HALF + 7, -PANEL_HALF + 7, PANEL_HALF * 2 - 14, PANEL_HALF * 2 - 14, 14);
	ctx.stroke();

	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillStyle = COLORS.text;
	ctx.font = `700 44px ${FONT}`;
	ctx.fillText(`${BAKAZE[scene.bakaze]}${scene.kyoku}局`, 0, -90);
	ctx.fillStyle = COLORS.dim;
	ctx.font = `500 22px ${FONT}`;
	ctx.fillText(`${scene.honba}本場　供託${scene.kyotaku}`, 0, -54);
	ctx.fillText(`残り${scene.tilesLeft}枚`, 0, -28);
	ctx.font = `500 15px ${FONT}`;
	ctx.fillText("ドラ表示牌", 0, -2);
	const doraW = 34;
	const count = scene.doraMarkers.length;
	scene.doraMarkers.forEach((pai, i) => drawTile(ctx, pai, -(count * doraW) / 2 + i * doraW, 10, doraW, doraW * (4 / 3)));

	ctx.fillStyle = COLORS.accent;
	ctx.font = `700 30px ${FONT}`;
	ctx.fillText(questionText(options.kind, options.choices, true), 0, 92);

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
		ctx.fillText(WINDS[wind], -(scoreWidth + 40) / 2, 148);
		ctx.fillStyle = COLORS.text;
		ctx.fillText(score, -(scoreWidth + 40) / 2 + 40, 148);
		ctx.restore();
	}
}

function drawCornerLabel(ctx: CanvasRenderingContext2D, size: number, problemId: number): void {
	ctx.save();
	ctx.scale(size / SCENE_SIZE, size / SCENE_SIZE);
	ctx.textAlign = "left";
	ctx.textBaseline = "top";
	ctx.fillStyle = COLORS.panelLine;
	ctx.font = `700 15px ${FONT}`;
	ctx.fillText("第", 26, 24);
	ctx.font = `700 30px ${FONT}`;
	ctx.fillText(String(problemId), 26, 44);
	ctx.font = `700 15px ${FONT}`;
	ctx.fillText("問", 26, 80);
	ctx.restore();
}
