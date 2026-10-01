// Share images (portrait 3:4, a problem without its result shorter) drawn in the browser, handed to the OS share sheet or saved.

import { type Mark, displayName, markOf } from "../shared/rules";
import type { Profile, Question, Result, SetProblem, Stats } from "../shared/types";
import { currentPublicId } from "./api";
import { h } from "./dom";
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

/** Problem image (with its question) on top; below it the mark and score, without revealing any answer. */
export async function problemCard(question: Question, result: Result, includeResult = true): Promise<HTMLCanvasElement> {
	await Promise.all([preloadScene(question.scene, question.choices), loadGlyphs(`${result.playerName} さん点${questionText(question.kind)}`)]);
	const margin = 40;
	const sceneWidth = WIDTH - 2 * margin;
	const bottom = margin + (sceneHeight() * sceneWidth) / SCENE_WIDTH;
	// Without the result, the image ends just below the scene with room for the footer.
	const [element, ctx] = canvas(includeResult ? HEIGHT : Math.round(bottom + 80));
	paper(ctx, 0);
	ctx.save();
	ctx.translate(margin, margin);
	drawScene(ctx, question.scene, sceneWidth, { problemId: question.id, kind: question.kind, choices: question.choices, prompt: questionText(question.kind) });
	ctx.restore();
	if (includeResult) {
		// The mark (220 tall) with the player and the score beside it, centred between the scene and the footer.
		const top = bottom + (HEIGHT - 70 - bottom - 220) / 2;
		paintMark(ctx, markOf(result.answer.score, result.answer.pitari), 56, top, 220, hanamaruFor(currentPublicId(), result.id, result.difficulty));
		playerLine(ctx, result.playerName, 318, top + 52);
		handScore(ctx, String(result.answer.score), 318, top + 200, 150);
	}
	footer(ctx);
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
