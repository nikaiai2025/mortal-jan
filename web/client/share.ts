// Share images (portrait 3:4, a problem without its result shorter) drawn in the browser, handed to the OS share sheet or saved.

import { type Mark, displayName, markOf } from "../shared/rules";
import type { Candidate, ProblemKind, Profile, Question, Result, SetProblem, Stats } from "../shared/types";
import { currentPublicId } from "./api";
import { h } from "./dom";
import { chosenSlot, handBars } from "./evaluation";
import { actionText } from "./labels";
import { hanamaruFor, paintMark, RED_INK } from "./marks";
import { SCENE_WIDTH, drawScene, preloadScene, questionText, sceneHeight } from "./scene";

export const SITE_NAME = "もーたる何切る教室";
/** Ends every post text, after what is shared (e.g. 第12問); the link follows. */
const HASHTAG = "#もーたる何切る教室";

const WIDTH = 1080;
const HEIGHT = 1440;
const PAPER = "#f5efe1";
const INK = "#1d2830";
const MUTED = "#6b6a5f";
const GOTHIC = "'Zen Kaku Gothic New', sans-serif";
const MINCHO = "'Shippori Mincho B1', serif";
const HAND = "'Klee One', cursive";

const DIGITS = "0123456789.,%—";

/** Japanese web fonts load in pieces on demand: fetch every piece this text needs before drawing it. */
async function loadGlyphs(text: string): Promise<void> {
	const used = `${text}${DIGITS}${SITE_NAME}${location.host}`;
	const fonts = [`600 40px ${HAND}`, `500 40px ${GOTHIC}`, `700 40px ${GOTHIC}`, `700 40px ${MINCHO}`, `800 40px ${MINCHO}`];
	await Promise.all(fonts.map((font) => document.fonts.load(font, used)));
}

function canvas(height = HEIGHT): [HTMLCanvasElement, CanvasRenderingContext2D] {
	const element = document.createElement("canvas");
	element.width = WIDTH;
	element.height = height;
	const ctx = element.getContext("2d");
	if (!ctx) throw new Error("canvas unavailable");
	return [element, ctx];
}

function paper(ctx: CanvasRenderingContext2D, top: number): void {
	const height = ctx.canvas.height;
	ctx.fillStyle = PAPER;
	ctx.fillRect(0, top, WIDTH, height - top);
	ctx.strokeStyle = "rgba(60, 90, 120, 0.12)";
	ctx.lineWidth = 2;
	for (let y = top + 72; y < height; y += 72) {
		ctx.beginPath();
		ctx.moveTo(0, y);
		ctx.lineTo(WIDTH, y);
		ctx.stroke();
	}
}

function footer(ctx: CanvasRenderingContext2D): void {
	ctx.textAlign = "right";
	ctx.textBaseline = "alphabetic";
	ctx.fillStyle = MUTED;
	// One line at the very bottom, clear of the content above it.
	const baseline = ctx.canvas.height - 24;
	ctx.font = `500 22px ${GOTHIC}`;
	ctx.fillText(location.host, WIDTH - 48, baseline);
	const hostWidth = ctx.measureText(location.host).width;
	ctx.font = `700 28px ${MINCHO}`;
	ctx.fillText(SITE_NAME, WIDTH - 48 - hostWidth - 18, baseline);
}

/** Whose result it is, shown only with the result. */
function playerLine(ctx: CanvasRenderingContext2D, name: string, x: number, y: number): void {
	ctx.textAlign = "left";
	ctx.textBaseline = "alphabetic";
	ctx.fillStyle = INK;
	ctx.font = `700 40px ${GOTHIC}`;
	ctx.fillText(`${name} さん`, x, y);
}

function handScore(ctx: CanvasRenderingContext2D, score: string, x: number, y: number, size: number): void {
	ctx.textAlign = "left";
	ctx.textBaseline = "alphabetic";
	ctx.fillStyle = RED_INK;
	ctx.font = `600 ${size}px ${HAND}`;
	ctx.fillText(score, x, y);
	const width = ctx.measureText(score).width;
	ctx.font = `600 ${size * 0.45}px ${HAND}`;
	ctx.fillText("点", x + width + 6, y);
}

/** The headline under a problem image shared without its result. */
function headlineText(kind: ProblemKind): string {
	if (kind === "discard") return "あなたなら、何を切る？";
	if (kind === "riichi") return "あなたなら、リーチする？";
	return "あなたなら、鳴く？";
}

/** Site name and host at the right end of a line (the problem card's headline or name line); returns the x where it starts. */
function siteMark(ctx: CanvasRenderingContext2D, baseline: number): number {
	ctx.textAlign = "right";
	ctx.textBaseline = "alphabetic";
	ctx.fillStyle = MUTED;
	ctx.font = `500 20px ${GOTHIC}`;
	ctx.fillText(location.host, WIDTH - 48, baseline);
	const hostWidth = ctx.measureText(location.host).width;
	ctx.fillStyle = INK;
	ctx.font = `700 28px ${MINCHO}`;
	const nameRight = WIDTH - 48 - hostWidth - 16;
	ctx.fillText(SITE_NAME, nameRight, baseline);
	return nameRight - ctx.measureText(SITE_NAME).width;
}

/** A line of text from x=48 that stops short of `limit` (the site mark), shrinking its font if needed. */
function fittedText(ctx: CanvasRenderingContext2D, text: string, baseline: number, font: (size: number) => string, size: number, limit: number): void {
	ctx.textAlign = "left";
	ctx.textBaseline = "alphabetic";
	for (let current = size; current >= 24; current -= 2) {
		ctx.font = font(current);
		if (ctx.measureText(text).width <= limit - 48 - 40) break;
	}
	ctx.fillText(text, 48, baseline);
}

/**
 * The grading as the page shows it over the board: the mark across the upper half, the handwritten
 * score at the right above the bars, and the ピタリ seal at the left. `x`, `y`, `size`: the board's box.
 */
function paintGrading(ctx: CanvasRenderingContext2D, result: Result, x: number, y: number, size: number): void {
	const mark = markOf(result.answer.score, result.answer.pitari);
	const markSize = size * 0.58;
	ctx.save();
	ctx.translate(x + size * 0.16 + markSize / 2, y + size * 0.04 + markSize / 2);
	ctx.rotate((-7 * Math.PI) / 180);
	ctx.shadowColor = "rgba(255, 253, 246, 0.9)";
	ctx.shadowBlur = 6;
	paintMark(ctx, mark, -markSize / 2, -markSize / 2, markSize, hanamaruFor(currentPublicId(), result.id, result.difficulty));
	ctx.restore();

	const scoreSize = size * 0.135;
	ctx.save();
	ctx.translate(x + size * 0.96, y + size * 0.73);
	ctx.rotate((-6 * Math.PI) / 180);
	ctx.textAlign = "right";
	ctx.textBaseline = "alphabetic";
	ctx.shadowColor = "rgba(255, 253, 246, 0.9)";
	ctx.shadowBlur = 6;
	ctx.fillStyle = RED_INK;
	ctx.font = `600 ${scoreSize * 0.45}px ${HAND}`;
	ctx.fillText("点", 0, 0);
	const unitWidth = ctx.measureText("点").width;
	ctx.font = `600 ${scoreSize}px ${HAND}`;
	ctx.fillText(String(result.answer.score), -unitWidth - 4, 0);
	ctx.restore();

	if (mark === "hanamaru") {
		const fontSize = size * 0.042;
		ctx.save();
		ctx.translate(x + size * 0.05, y + size * 0.72);
		ctx.rotate((-12 * Math.PI) / 180);
		ctx.font = `800 ${fontSize}px ${MINCHO}`;
		ctx.textAlign = "left";
		ctx.textBaseline = "middle";
		const width = ctx.measureText("ピタリ").width + fontSize * 1.1;
		const height = fontSize * 1.7;
		ctx.fillStyle = RED_INK;
		ctx.beginPath();
		ctx.roundRect(0, -height / 2, width, height, 6);
		ctx.fill();
		ctx.strokeStyle = "#fff6ea";
		ctx.lineWidth = 2;
		ctx.strokeRect(4, -height / 2 + 4, width - 8, height - 8);
		ctx.fillStyle = "#fff6ea";
		ctx.fillText("ピタリ", fontSize * 0.55, 1);
		ctx.restore();
	}
}

/** For a call problem, which has no bars over the hand: the candidates as the result lists them. */
function candidateRows(result: Result): Candidate[] {
	const shown = result.evaluation.candidates.filter((c, i) => i < 3 || c.p >= 0.01).slice(0, 4);
	const mine = result.evaluation.candidates.find((c) => c.action === result.answer.action);
	if (mine && !shown.includes(mine)) shown.push(mine);
	return shown;
}

function paintCandidates(ctx: CanvasRenderingContext2D, result: Result, top: number): void {
	const rowHeight = 60;
	const barX = 420;
	const barWidth = 360;
	candidateRows(result).forEach((candidate, index) => {
		const y = top + index * rowHeight;
		const mine = candidate.action === result.answer.action;
		if (mine) {
			ctx.fillStyle = "rgba(214, 42, 30, 0.08)";
			ctx.fillRect(48, y - 40, WIDTH - 96, rowHeight - 4);
		}
		ctx.textBaseline = "alphabetic";
		ctx.textAlign = "left";
		ctx.fillStyle = INK;
		ctx.font = `700 34px ${GOTHIC}`;
		ctx.fillText(actionText(candidate.action, result), 64, y);
		ctx.fillStyle = "#e4dcc6";
		ctx.fillRect(barX, y - 22, barWidth, 16);
		ctx.fillStyle = candidate.action === result.evaluation.best ? RED_INK : "#1b5741";
		ctx.fillRect(barX, y - 22, Math.max(4, barWidth * candidate.p), 16);
		ctx.textAlign = "right";
		ctx.fillStyle = MUTED;
		ctx.font = `500 30px ${GOTHIC}`;
		ctx.fillText(`${(candidate.p * 100).toFixed(candidate.p < 0.1 ? 1 : 0)}%`, 890, y);
		ctx.fillStyle = mine ? RED_INK : INK;
		ctx.font = `700 34px ${GOTHIC}`;
		ctx.fillText(`${candidate.score}点`, WIDTH - 64, y);
	});
}

/**
 * Problem image on top. Without the result: the question on the board and a headline under it.
 * With it: the board as the result page shows it (the chosen tile, the evaluation bars, the mark and
 * the score), the player's name and score under it, and for a call problem the candidates.
 */
export async function problemCard(question: Question, result: Result, includeResult = true): Promise<HTMLCanvasElement> {
	const candidates = question.kind === "call" ? candidateRows(result).map((c) => actionText(c.action, result)).join("") : "";
	await Promise.all([
		preloadScene(question.scene, question.choices),
		loadGlyphs(`${result.playerName} さん点${questionText(question.kind)}${headlineText(question.kind)}ピタリ${candidates}`),
	]);
	const margin = 40;
	const sceneWidth = WIDTH - 2 * margin;
	const bottom = margin + (sceneHeight() * sceneWidth) / SCENE_WIDTH;
	const line = bottom + 92; // baseline of the line under the board
	const [element, ctx] = canvas(includeResult ? HEIGHT : Math.round(line + 44));
	paper(ctx, 0);
	ctx.save();
	ctx.translate(margin, margin);
	const hand = includeResult && question.kind !== "call" ? { selected: chosenSlot(result), bars: handBars(result) } : undefined;
	drawScene(ctx, question.scene, sceneWidth, {
		problemId: question.id,
		kind: question.kind,
		choices: question.choices,
		prompt: includeResult ? undefined : questionText(question.kind),
		promptSize: 44,
		promptColor: "#ffd166",
		hand,
	});
	ctx.restore();
	const limit = siteMark(ctx, line);
	if (!includeResult) {
		ctx.fillStyle = INK;
		fittedText(ctx, headlineText(question.kind), line, (size) => `800 ${size}px ${MINCHO}`, 50, limit);
		return element;
	}
	paintGrading(ctx, result, margin, margin, sceneWidth);
	ctx.fillStyle = INK;
	fittedText(ctx, `${result.playerName} さん`, line, (size) => `700 ${size}px ${GOTHIC}`, 40, limit - 150);
	const nameWidth = ctx.measureText(`${result.playerName} さん`).width;
	handScore(ctx, String(result.answer.score), 48 + nameWidth + 28, line, 72);
	if (question.kind === "call") paintCandidates(ctx, result, line + 90);
	return element;
}

/** A set is always shared with its result. */
export async function setCard(title: string, problems: SetProblem[], playerName: string): Promise<HTMLCanvasElement> {
	await loadGlyphs(`${title}${playerName} さんピタリ /第問点`);
	const [element, ctx] = canvas();
	paper(ctx, 0);
	const answers = problems.flatMap((p) => (p.answer ? [p.answer] : []));
	const total = answers.reduce((sum, a) => sum + a.score, 0) / problems.length;
	const pitari = answers.filter((a) => a.pitari).length;

	ctx.textAlign = "left";
	ctx.fillStyle = INK;
	ctx.font = `800 64px ${MINCHO}`;
	ctx.fillText(title, 72, 150);
	playerLine(ctx, playerName, 72, 212);
	handScore(ctx, total.toFixed(1), 72, 380, 190);
	ctx.fillStyle = INK;
	ctx.font = `700 44px ${GOTHIC}`;
	ctx.fillText(`ピタリ ${pitari} / ${problems.length}`, 80, 470);

	problems.forEach((problem, index) => {
		const x = 80 + (index % 2) * 480;
		const y = 560 + Math.floor(index / 2) * 150;
		const mark: Mark = problem.answer ? markOf(problem.answer.score, problem.answer.pitari) : "batsu";
		paintMark(ctx, mark, x, y, 110, hanamaruFor(currentPublicId(), problem.id, problem.difficulty));
		ctx.fillStyle = INK;
		ctx.font = `600 34px ${GOTHIC}`;
		ctx.fillText(`第${problem.id}問`, x + 132, y + 50);
		ctx.fillStyle = RED_INK;
		ctx.font = `600 44px ${HAND}`;
		ctx.fillText(`${problem.answer?.score ?? 0}点`, x + 132, y + 104);
	});
	footer(ctx);
	return element;
}

export async function profileCard(profile: Profile): Promise<HTMLCanvasElement> {
	await loadGlyphs(`成績表${displayName(profile.name, profile.publicId)}全期間今日回答数平均点ピタリ率問`);
	const [element, ctx] = canvas();
	paper(ctx, 0);
	ctx.textAlign = "left";
	ctx.fillStyle = INK;
	ctx.font = `800 60px ${MINCHO}`;
	ctx.fillText("成績表", 72, 150);
	ctx.font = `700 46px ${GOTHIC}`;
	ctx.fillText(displayName(profile.name, profile.publicId), 72, 240);

	// 全期間 and 今日 side by side, three figures each.
	const columnWidth = 440;
	const periods: [string, Stats][] = [
		["全期間", profile.all],
		["今日", profile.today],
	];
	periods.forEach(([period, stats], column) => {
		const x = 80 + column * (columnWidth + 40);
		ctx.fillStyle = INK;
		ctx.font = `800 48px ${MINCHO}`;
		ctx.fillText(period, x, 370);
		const rows: [string, string][] = [
			["回答数", `${stats.answers}問`],
			["平均点", stats.answers ? `${(stats.scoreSum / stats.answers).toFixed(1)}点` : "—"],
			["ピタリ率", stats.answers ? `${((stats.pitari / stats.answers) * 100).toFixed(1)}%` : "—"],
		];
		rows.forEach(([label, value], index) => {
			const y = 470 + index * 270;
			ctx.fillStyle = MUTED;
			ctx.font = `700 36px ${GOTHIC}`;
			ctx.fillText(label, x, y);
			ctx.fillStyle = RED_INK;
			ctx.font = `600 110px ${HAND}`;
			ctx.fillText(value, x, y + 120, columnWidth);
		});
	});
	footer(ctx);
	return element;
}

async function toFile(element: HTMLCanvasElement, name: string): Promise<File> {
	const blob = await new Promise<Blob | null>((resolve) => element.toBlob(resolve, "image/png"));
	if (!blob) throw new Error("image encoding failed");
	return new File([blob], name, { type: "image/png" });
}

/** Preview dialog: OS share sheet when it accepts images, otherwise save + X post screen. */
export async function openShare(
	element: HTMLCanvasElement,
	/** What is shared, at the start of the post text: 第12問, 問題集 第4集, 私の成績. */
	label: string,
	url: string,
	name: string,
	withoutResult?: () => Promise<{ element: HTMLCanvasElement; url: string }>,
): Promise<void> {
	const file = await toFile(element, name);
	const text = `${label} ${HASHTAG}`;
	const initial = { file, url };
	let current = initial;
	let revision = 0;
	const preview = h("img", { class: "share__preview", src: URL.createObjectURL(file), alt: "共有する画像" });
	const dialog = h("dialog", { class: "share" }) as HTMLDialogElement;
	const close = () => dialog.close();
	dialog.addEventListener("close", () => {
		revision++;
		URL.revokeObjectURL(preview.src);
		dialog.remove();
	});
	const actions = h("div", { class: "share__actions" });
	if (navigator.canShare?.({ files: [file] })) {
		actions.append(
			h(
				"button",
				{
					class: "stamp-button",
					type: "button",
					onclick: async () => {
						try {
							await navigator.share({ files: [current.file], text: `${text}\n${current.url}` });
							close();
						} catch {
							// cancelled
						}
					},
				},
				"共有する",
			),
		);
	}
	const save = () => {
		const link = h("a", { href: preview.src, download: name });
		link.click();
	};
	const postToX = () => {
		save();
		window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(current.url)}`, "_blank", "noopener");
	};
	const closeButton = h("button", { class: "ghost-button", type: "button", onclick: close }, "閉じる");
	actions.append(
		h("button", { class: "ghost-button", type: "button", onclick: save }, "画像を保存"),
		h("button", { class: "ghost-button", type: "button", onclick: postToX }, "Xに投稿"),
		closeButton,
	);
	const message = h("p", { class: "form-message share__message", role: "alert" });
	const toggle = h("input", { type: "checkbox", role: "switch", checked: true });
	if (withoutResult) {
		toggle.addEventListener("change", async () => {
			const update = ++revision;
			const includeResult = toggle.checked;
			const busy = (value: boolean) => {
				dialog.setAttribute("aria-busy", String(value));
				for (const button of actions.querySelectorAll("button")) if (button !== closeButton) button.disabled = value;
			};
			message.textContent = "";
			busy(true);
			try {
				let next = initial;
				if (!includeResult) {
					const content = await withoutResult();
					next = { file: await toFile(content.element, name), url: content.url };
				}
				if (update !== revision || !dialog.open) return;
				const oldUrl = preview.src;
				preview.src = URL.createObjectURL(next.file);
				current = next;
				URL.revokeObjectURL(oldUrl);
			} catch (error) {
				if (update !== revision || !dialog.open) return;
				console.error(error);
				toggle.checked = current === initial;
				message.textContent = "画像を生成できませんでした。もう一度切り替えてください。";
			} finally {
				if (update === revision && dialog.open) busy(false);
			}
		});
		dialog.append(h("label", { class: "share__toggle" }, "採点結果を含める", toggle));
	}
	dialog.append(
		preview,
		message,
		h("p", { class: "share__note" }, "Xに投稿するときは、保存した画像を投稿画面で添付してください。"),
		actions,
	);
	document.body.append(dialog);
	dialog.showModal();
}
