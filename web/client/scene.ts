// Draws a problem scene on a canvas in a 1000×1000 coordinate space.
// Each seat is laid out as if it sat at the bottom, then rotated around the centre.

import type { Choice, Meld, Pai, ProblemKind, RiverTile, Scene } from "../shared/types";
import { BACK_URL, FRONT_URL, deaka, faceUrl, preloadTiles, tileImage } from "./tiles";

const RIVER_W = 44;
const RIVER_H = 59;
const HAND_W = 66;
const HAND_H = 88;
// The centre panel is wider than tall: the side players' scores stand upright in it.
const PANEL_HALF_X = 175;
const PANEL_HALF_Y = 95;
const SCORE_SIZE = 32;
const RIVER_GAP = 26; // room for a riichi stick between the panel and a river
const RIVER_X = -3 * RIVER_W;
const RIVER_ROW = 6;
const RIVER_DEPTH = 3 * RIVER_H; // rows of six; the third row takes the rest
const OPPONENT_GAP = 10; // between a river and its owner's row
const MARGIN = 8;
export const RAISE = 16; // a selected hand tile rises by this much

/** Each opponent's row sits just outside the river; the side rows reach furthest across. */
export const SCENE_WIDTH = 2 * (PANEL_HALF_X + RIVER_GAP + RIVER_DEPTH + OPPONENT_GAP + RIVER_H + MARGIN);
const CENTRE_X = SCENE_WIDTH / 2;
const CENTRE_Y = PANEL_HALF_Y + RIVER_GAP + RIVER_DEPTH + OPPONENT_GAP + RIVER_H + MARGIN;
// Half lengths of the opponents' rows: clear of the problem number in the top-left corner and of the own hand (also of a kakan on it).
const ACROSS_ROW_HALF = 340;
const SIDE_ROW_HALF = 285;
const SELF_ROW_HALF = CENTRE_X - 10;
const RIVER_END = CENTRE_Y + PANEL_HALF_Y + RIVER_GAP + RIVER_DEPTH; // the own river's lower edge
// The evaluation bars rise from just above a raised tile, with up to two percentages (riichi) above the tallest.
const BAR_GAP = 12;
const BAR_MAX = 83;
const LABEL_GAP = 6;
const LABEL_LINE = 16;
/**
 * Between the own river and the hand: the question and its confirm button before answering, the
 * evaluation bars with their labels after it. Call choices stay under the board.
 */
const BAND = RAISE + BAR_GAP + BAR_MAX + LABEL_GAP + 2 * LABEL_LINE + 6;
const HAND_TOP = RIVER_END + BAND;

export function sceneHeight(): number {
	return HAND_TOP + HAND_H + 11;
}

/** The band above the hand (see BAND), clear of the river and of a raised tile. */
export function handBand(): { top: number; bottom: number } {
	return { top: RIVER_END + 6, bottom: HAND_TOP - RAISE - 6 };
}

const COLORS = {
	panel: "#0e2a21",
	panelLine: "#c9a45c",
	text: "#f1e8d0",
	dim: "#9fb8aa",
	accent: "#ffd166",
	oya: "#ff8f70",
	red: "#d62a1e",
};

const FONT = "'Zen Kaku Gothic New', 'Hiragino Sans', 'Noto Sans JP', sans-serif";
const MINCHO = "'Shippori Mincho B1', 'Hiragino Mincho ProN', serif";
const WINDS = ["東", "南", "西", "北"];
const BAKAZE: Record<string, string> = { E: "東", S: "南", W: "西", N: "北" };
// Relative seat → rotation (0 bottom, 1 right, 2 top, 3 left).
const ROTATIONS = [0, -Math.PI / 2, Math.PI, Math.PI / 2];

export function questionText(kind: ProblemKind): string {
	if (kind === "discard") return "何を切る？";
	if (kind === "riichi") return "リーチする？ 何を切る？";
	return "鳴く？";
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
		x: CENTRE_X - SELF_ROW_HALF + index * w + (scene.drawn && index === tiles.length - 1 ? drawGap * scale : 0),
		y: HAND_TOP,
		w,
		h,
	}));
}

/** Interaction and result state of the own hand. */
export interface HandView {
	selected: number | null;
	/** Per slot; false dims a tile that cannot be chosen now. */
	enabled?: boolean[];
	/** The tile under the mouse pointer, lifted a little. */
	hovered?: number | null;
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

/** A label in the band above the hand (share images): over a hand tile, or free-standing when `index` is null. */
export interface HandTag {
	index: number | null;
	text: string;
	color: string;
}

export interface SceneOptions {
	problemId: number;
	kind: ProblemKind;
	/** Choices of a call problem: the hand tiles they use are joined to the discard. */
	choices?: Choice[];
	/** The question, drawn above the hand where the page shows it (for share images). */
	prompt?: string;
	/** Size and colour of the prompt; the share image makes it the headline of the board. */
	promptSize?: number;
	promptColor?: string;
	/** Labels in the band (the player's answer, the AI's best) for share images. */
	tags?: HandTag[];
	hand?: HandView;
}

/** Draw `width` pixels wide (and width × sceneHeight / SCENE_WIDTH tall) at the current origin. Tiles must be preloaded. */
export function drawScene(ctx: CanvasRenderingContext2D, scene: Scene, width: number, options: SceneOptions): void {
	ctx.save();
	ctx.scale(width / SCENE_WIDTH, width / SCENE_WIDTH);
	drawFelt(ctx, options.kind);
	const labelRight = drawCornerLabel(ctx, options.problemId);
	ctx.save();
	ctx.translate(CENTRE_X, CENTRE_Y);
	for (let relative = 0; relative < 4; relative++) {
		const seat = (scene.seat + relative) % 4;
		ctx.save();
		ctx.rotate(ROTATIONS[relative]);
		// Distance from the centre to the panel's edge on this seat's side.
		const panelEdge = relative % 2 === 0 ? PANEL_HALF_Y : PANEL_HALF_X;
		if (scene.riichi[seat]) drawRiichi(ctx, panelEdge);
		drawRiver(ctx, scene, seat, riverY(relative), ROTATIONS[relative]);
		if (relative > 0) {
			const half = relative === 2 ? ACROSS_ROW_HALF : SIDE_ROW_HALF;
			// After rotation, the across row's end is beside the problem number on the left.
			const end = relative === 2 ? Math.min(half, CENTRE_X - labelRight - 14) : half;
			drawOpponentRow(ctx, scene, seat, half, panelEdge + RIVER_GAP + RIVER_DEPTH + OPPONENT_GAP, end);
		}
		ctx.restore();
	}
	drawPanel(ctx, scene);
	ctx.restore();
	drawOwnRow(ctx, scene, options.hand);
	if (options.choices) drawCallMarks(ctx, scene, options.choices);
	if (options.prompt) drawPrompt(ctx, options.prompt, options.promptSize ?? 32, options.promptColor ?? "#f6efdc");
	if (options.tags) drawTags(ctx, scene, options.tags, options.hand?.selected ?? null);
	if (options.hand?.bars) drawBars(ctx, scene, options.hand.bars, options.hand.barProgress ?? 1);
	ctx.restore();
}

function drawFelt(ctx: CanvasRenderingContext2D, kind: ProblemKind): void {
	const gradient = ctx.createRadialGradient(CENTRE_X, CENTRE_Y, 80, CENTRE_X, CENTRE_Y, CENTRE_X * 1.45);
	gradient.addColorStop(0, kind === "discard" ? "#1b5741" : "#327fa3");
	gradient.addColorStop(1, kind === "discard" ? "#123d2e" : "#20536f");
	ctx.fillStyle = gradient;
	ctx.fillRect(0, 0, SCENE_WIDTH, sceneHeight());
}

/** The question in the band above the hand, as the page sets it there. */
function drawPrompt(ctx: CanvasRenderingContext2D, text: string, size: number, color: string): void {
	const band = handBand();
	ctx.save();
	ctx.font = `800 ${size}px ${MINCHO}`;
	ctx.fillStyle = color;
	ctx.textAlign = "left";
	ctx.textBaseline = "middle";
	ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
	ctx.shadowBlur = 4;
	ctx.shadowOffsetY = 2;
	ctx.fillText(text, SCENE_WIDTH * 0.02, (band.top + band.bottom) / 2);
	ctx.restore();
}

/**
 * Labels in the band: each anchored one sits over its tile with a pointer down to it (a second label on
 * the same tile stacks above the first); free-standing ones line up from the left at the band's middle.
 */
function drawTags(ctx: CanvasRenderingContext2D, scene: Scene, tags: HandTag[], selected: number | null): void {
	const slots = handSlots(scene);
	const band = handBand();
	const height = 36;
	const pointer = 9;
	ctx.save();
	ctx.font = `700 22px ${FONT}`;
	ctx.textAlign = "left";
	ctx.textBaseline = "middle";
	const occupied: { x: number; w: number; bottom: number }[] = [];
	let freeX = MARGIN + 6;
	for (const tag of tags) {
		const width = ctx.measureText(tag.text).width + 26;
		let x: number;
		let bottom: number;
		const slot = tag.index !== null ? slots[tag.index] : undefined;
		if (slot) {
			const top = slot.y - (selected === tag.index ? RAISE : 0);
			x = Math.min(Math.max(MARGIN, slot.x + slot.w / 2 - width / 2), SCENE_WIDTH - MARGIN - width);
			bottom = top - pointer - 4;
			// Stack above a label already sitting over the same place.
			for (const other of occupied) if (x < other.x + other.w && other.x < x + width) bottom = Math.min(bottom, other.bottom - height - 10);
		} else {
			x = freeX;
			bottom = (band.top + band.bottom) / 2 + height / 2;
			freeX += width + 14;
		}
		occupied.push({ x, w: width, bottom });
		ctx.fillStyle = tag.color;
		ctx.beginPath();
		ctx.roundRect(x, bottom - height, width, height, 8);
		ctx.fill();
		if (slot) {
			const centre = slot.x + slot.w / 2;
			ctx.beginPath();
			ctx.moveTo(centre - pointer, bottom - 1);
			ctx.lineTo(centre + pointer, bottom - 1);
			ctx.lineTo(centre, bottom + pointer);
			ctx.closePath();
			ctx.fill();
		}
		ctx.fillStyle = "#fff6ea";
		ctx.fillText(tag.text, x + 13, bottom - height / 2 + 1);
	}
	ctx.restore();
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
export function drawTile(ctx: CanvasRenderingContext2D, pai: Pai | null, x: number, y: number, w: number, h: number, o: TileOptions = {}): void {
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

/** Distance from the centre to the river of the seat at this relative position. */
const riverY = (relative: number) => (relative % 2 === 0 ? PANEL_HALF_Y : PANEL_HALF_X) + RIVER_GAP;

/** Bounding boxes of the river tiles in the seat's frame: rows of six, the third row taking the rest. */
function riverBoxes(river: RiverTile[], top: number): { x: number; y: number; w: number; h: number }[] {
	let x = RIVER_X;
	return river.map((tile, index) => {
		const row = Math.min(Math.floor(index / RIVER_ROW), 2);
		if (index === RIVER_ROW || index === 2 * RIVER_ROW) x = RIVER_X;
		const y = top + row * RIVER_H;
		const box = tile.riichi ? { x, y: y + (RIVER_H - RIVER_W), w: RIVER_H, h: RIVER_W } : { x, y, w: RIVER_W, h: RIVER_H };
		x += box.w;
		return box;
	});
}

/** `turn` is the seat's rotation, which the mark on a called tile undoes so that it stands upright. */
function drawRiver(ctx: CanvasRenderingContext2D, scene: Scene, seat: number, top: number, turn: number): void {
	const river = scene.rivers[seat];
	riverBoxes(river, top).forEach((box, index) => {
		const tile = river[index];
		drawTile(ctx, tile.pai, box.x, box.y, RIVER_W, RIVER_H, { sideways: tile.riichi, dim: tile.tsumogiri });
		// A called tile stays in the river, marked.
		if (tile.called) drawCalledMark(ctx, box.x + box.w / 2, box.y + box.h / 2, turn);
	});
}

/** Centre of the discard a call problem asks about (the last of its river), in scene coordinates. */
export function targetCentre(scene: Scene): { x: number; y: number } | null {
	if (!scene.target) return null;
	const relative = (scene.target.actor - scene.seat + 4) % 4;
	const box = riverBoxes(scene.rivers[scene.target.actor], riverY(relative)).at(-1);
	if (!box) return null;
	const [x, y] = [box.x + box.w / 2, box.y + box.h / 2];
	const turn = ROTATIONS[relative];
	return { x: CENTRE_X + x * Math.cos(turn) - y * Math.sin(turn), y: CENTRE_Y + x * Math.sin(turn) + y * Math.cos(turn) };
}

/** Hand tiles of a kind that some call choice uses (a red five counts as a five). */
export function callableSlots(scene: Scene, choices: Choice[]): HandSlot[] {
	const kinds = new Set(choices.flatMap((c) => c.consumed ?? []).map(deaka));
	return handSlots(scene).filter((slot) => kinds.has(deaka(slot.pai)));
}

const CALL_RING = 42; // round a river tile, clear of its corners

/**
 * In red pen: a ring round the discard, one long line over the hand tiles that can call it (as one
 * group, from the first to the last), and one stroke joining the ring to the middle of that line.
 */
function drawCallMarks(ctx: CanvasRenderingContext2D, scene: Scene, choices: Choice[]): void {
	const centre = targetCentre(scene);
	if (!centre) return;
	ctx.save();
	ctx.strokeStyle = COLORS.red;
	ctx.lineCap = "round";
	// A pale halo keeps the red readable on the felt and over tiles.
	ctx.shadowColor = "rgba(255, 253, 246, 0.85)";
	ctx.shadowBlur = 4;
	ctx.lineWidth = 5;
	ctx.beginPath();
	ctx.arc(centre.x, centre.y, CALL_RING, 0, Math.PI * 2);
	ctx.stroke();
	const slots = callableSlots(scene, choices);
	if (slots.length) {
		const first = slots[0];
		const last = slots[slots.length - 1];
		const y = first.y - 4;
		ctx.lineWidth = 6;
		ctx.beginPath();
		ctx.moveTo(first.x + 5, y);
		ctx.lineTo(last.x + last.w - 5, y);
		ctx.stroke();
		const end = { x: (first.x + last.x + last.w) / 2, y };
		const angle = Math.atan2(end.y - centre.y, end.x - centre.x);
		ctx.lineWidth = 3;
		ctx.beginPath();
		ctx.moveTo(centre.x + CALL_RING * Math.cos(angle), centre.y + CALL_RING * Math.sin(angle));
		ctx.lineTo(end.x, end.y);
		ctx.stroke();
	}
	ctx.restore();
}

/** 鳴 in a circle, upright on the screen. */
function drawCalledMark(ctx: CanvasRenderingContext2D, x: number, y: number, turn: number): void {
	const r = 15;
	ctx.save();
	ctx.translate(x, y);
	ctx.rotate(-turn);
	ctx.beginPath();
	ctx.arc(0, 0, r, 0, Math.PI * 2);
	ctx.fillStyle = "rgba(255, 253, 246, 0.92)";
	ctx.fill();
	ctx.strokeStyle = COLORS.red;
	ctx.lineWidth = 2.5;
	ctx.stroke();
	ctx.fillStyle = COLORS.red;
	ctx.font = `700 19px ${FONT}`;
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillText("鳴", 0, 1);
	ctx.restore();
}

/** A riichi player: a lit stick, a label, and a red wash under the river. */
function drawRiichi(ctx: CanvasRenderingContext2D, panelEdge: number): void {
	const top = panelEdge + RIVER_GAP;
	const washRight = -RIVER_X + 10;
	ctx.fillStyle = "rgba(214, 42, 30, 0.3)";
	roundRect(ctx, -washRight, top - 8, 2 * washRight, RIVER_H * 3 + 16, 12);
	ctx.fill();
	ctx.strokeStyle = "rgba(255, 120, 100, 0.7)";
	ctx.lineWidth = 3;
	ctx.stroke();

	// The stick in the middle, the label ending at the wash's edge.
	const labelW = 74;
	const w = 120;
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
	roundRect(ctx, washRight - labelW, y - 7, labelW, 27, 6);
	ctx.fill();
	ctx.fillStyle = "#fff6ea";
	ctx.font = `700 18px ${FONT}`;
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillText("リーチ", washRight - labelW / 2, y + 7);
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
		const hovered = !selected && view?.hovered === slot.index;
		drawTile(ctx, slot.pai, slot.x, slot.y - (selected ? RAISE : hovered ? RAISE / 2 : 0), slot.w, slot.h, {
			selected,
			highlight: hovered,
			dim: view?.enabled ? !view.enabled[slot.index] : false,
		});
	}
	const { w, h } = slots[0] ?? { w: HAND_W, h: HAND_H };
	drawMelds(ctx, scene.melds[scene.seat], scene.seat, CENTRE_X + SELF_ROW_HALF, HAND_TOP + h, w, h);
}

/** An opponent's row, from `-half` to `end`, at `top` away from the centre. */
function drawOpponentRow(ctx: CanvasRenderingContext2D, scene: Scene, seat: number, half: number, top: number, end: number): void {
	const melds = scene.melds[seat];
	const concealed = scene.concealedCounts[seat];
	const natural = concealed * RIVER_W + RIVER_W * 0.4 + meldsTotalWidth(melds, seat, RIVER_W, RIVER_H);
	const scale = Math.min(1, (half + end) / natural);
	const w = RIVER_W * scale;
	const h = RIVER_H * scale;
	for (let i = 0; i < concealed; i++) drawTile(ctx, null, -half + i * w, top, w, h, { back: true });
	drawMelds(ctx, melds, seat, end, top + h, w, h);
}

// ---- evaluation bars ----

/** AI evaluation of each hand tile as bars rising from the hand into the room below the own river (after answering). */
function drawBars(ctx: CanvasRenderingContext2D, scene: Scene, bars: HandBar[], progress: number): void {
	const slots = handSlots(scene);
	// Clear of a selected tile, which rises by RAISE.
	const base = slots[0].y - RAISE - BAR_GAP;
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
			ctx.fillText(`${Math.round(column.value * 100)}%`, slot.x + slot.w / 2, base - tallest - LABEL_GAP - (labels.length - 1 - i) * LABEL_LINE);
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

	drawRound(ctx, scene, -32);
	drawDeadWall(ctx, scene, -8);
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillStyle = COLORS.dim;
	ctx.font = `500 17px ${FONT}`;
	ctx.fillText(`残り${scene.tilesLeft}`, 0, 42);

	// Every score stands upright, on its player's side: one line above and below (as far from the
	// frame on both), two lines left and right.
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
		ctx.font = `800 ${SCORE_SIZE}px ${FONT}`;
		if (relative % 2 === 0) {
			const scoreWidth = ctx.measureText(score).width;
			ctx.font = `700 24px ${FONT}`;
			const windWidth = ctx.measureText(wind).width + 8;
			const left = x - (windWidth + scoreWidth) / 2;
			ctx.textAlign = "left";
			ctx.fillStyle = windColor;
			ctx.fillText(wind, left, y);
			ctx.font = `800 ${SCORE_SIZE}px ${FONT}`;
			ctx.fillStyle = COLORS.text;
			ctx.fillText(score, left + windWidth, y);
		} else {
			ctx.textAlign = "center";
			ctx.fillStyle = COLORS.text;
			ctx.fillText(score, x, y + 16, 90);
			ctx.font = `700 24px ${FONT}`;
			ctx.fillStyle = windColor;
			ctx.fillText(wind, x, y - 16);
		}
	}
}

/** "東1局" in a framed box; beside it the deposited 1000-point sticks and the honba (100-point sticks). */
function drawRound(ctx: CanvasRenderingContext2D, scene: Scene, y: number): void {
	const wind = BAKAZE[scene.bakaze];
	const label = `${scene.kyoku}局`;
	ctx.font = `800 30px ${FONT}`;
	const windWidth = ctx.measureText(wind).width + 2;
	ctx.font = `800 22px ${FONT}`;
	const boxW = windWidth + ctx.measureText(label).width + 16;
	const boxH = 40;
	const left = -(boxW + 8 + 62) / 2;
	ctx.fillStyle = "#121b18";
	roundRect(ctx, left, y - boxH / 2, boxW, boxH, 7);
	ctx.fill();
	ctx.strokeStyle = "#e9e2cf";
	ctx.lineWidth = 2;
	ctx.stroke();
	ctx.textAlign = "left";
	ctx.textBaseline = "middle";
	ctx.fillStyle = scene.bakaze === "S" ? COLORS.accent : COLORS.text;
	ctx.font = `800 30px ${FONT}`;
	ctx.fillText(wind, left + 8, y + 1);
	ctx.fillStyle = COLORS.text;
	ctx.font = `800 22px ${FONT}`;
	ctx.fillText(label, left + 8 + windWidth, y + 1);

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

function drawCornerLabel(ctx: CanvasRenderingContext2D, problemId: number): number {
	ctx.save();
	ctx.textAlign = "left";
	ctx.textBaseline = "alphabetic";
	ctx.fillStyle = "#fff6df";
	ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
	ctx.shadowBlur = 3;
	ctx.shadowOffsetY = 2;
	let right = 16;
	for (const [text, size] of [["第", 22], [String(problemId), 44], ["問", 22]] as const) {
		ctx.font = `${size === 44 ? 800 : 700} ${size}px ${FONT}`;
		ctx.fillText(text, right, 50);
		right += ctx.measureText(text).width + 2;
	}
	ctx.restore();
	return right - 2;
}
