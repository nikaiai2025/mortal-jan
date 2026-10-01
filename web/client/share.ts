// Share images (portrait 3:4) drawn in the browser, handed to the OS share sheet or saved.

import { type Mark, displayName, markOf } from "../shared/rules";
import type { Profile, Question, Result, SetProblem } from "../shared/types";
import { currentPublicId } from "./api";
import { h } from "./dom";
import { hanamaruFor, paintMark, RED_INK } from "./marks";
import { drawScene, preloadScene, questionText } from "./scene";

export const SITE_NAME = "もーたる何切る教室";
export const HASHTAG = "#もーたる何切る教室";

const WIDTH = 1080;
const HEIGHT = 1440;
const PAPER = "#f5efe1";
const INK = "#1d2830";
const MUTED = "#6b6a5f";
const GOTHIC = "'Zen Kaku Gothic New', sans-serif";
const MINCHO = "'Shippori Mincho B1', serif";
const HAND = "'Klee One', cursive";

function canvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
	const element = document.createElement("canvas");
	element.width = WIDTH;
	element.height = HEIGHT;
	const ctx = element.getContext("2d");
	if (!ctx) throw new Error("canvas unavailable");
	return [element, ctx];
}

function paper(ctx: CanvasRenderingContext2D, top: number): void {
	ctx.fillStyle = PAPER;
	ctx.fillRect(0, top, WIDTH, HEIGHT - top);
	ctx.strokeStyle = "rgba(60, 90, 120, 0.12)";
	ctx.lineWidth = 2;
	for (let y = top + 72; y < HEIGHT; y += 72) {
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
	ctx.font = `700 30px ${MINCHO}`;
	ctx.fillText(SITE_NAME, WIDTH - 48, HEIGHT - 46);
	ctx.font = `500 22px ${GOTHIC}`;
	ctx.fillText(location.host, WIDTH - 48, HEIGHT - 84);
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

/** Problem image on top; below it the mark and score, without revealing any answer. */
export async function problemCard(question: Question, result: Result): Promise<HTMLCanvasElement> {
	await Promise.all([preloadScene(question.scene, question.choices), document.fonts.ready]);
	const [element, ctx] = canvas();
	drawScene(ctx, question.scene, WIDTH, { problemId: question.id });
	paper(ctx, WIDTH);
	paintMark(ctx, markOf(result.answer.score, result.answer.pitari), 56, WIDTH + 44, 230, hanamaruFor(currentPublicId(), result.id));
	handScore(ctx, String(result.answer.score), 318, WIDTH + 190, 150);
	ctx.textAlign = "left";
	ctx.fillStyle = INK;
	ctx.font = `700 40px ${GOTHIC}`;
	ctx.fillText(`あなたなら？ ${questionText(question.kind, question.choices)}`, 318, WIDTH + 262);
	footer(ctx);
	return element;
}

export async function setCard(title: string, problems: SetProblem[]): Promise<HTMLCanvasElement> {
	await document.fonts.ready;
	const [element, ctx] = canvas();
	paper(ctx, 0);
	const answers = problems.flatMap((p) => (p.answer ? [p.answer] : []));
	const total = answers.reduce((sum, a) => sum + a.score, 0) / problems.length;
	const pitari = answers.filter((a) => a.pitari).length;

	ctx.textAlign = "left";
	ctx.fillStyle = INK;
	ctx.font = `800 64px ${MINCHO}`;
	ctx.fillText(title, 72, 150);
	handScore(ctx, total.toFixed(1), 72, 380, 190);
	ctx.fillStyle = INK;
	ctx.font = `700 44px ${GOTHIC}`;
	ctx.fillText(`ピタリ ${pitari} / ${problems.length}`, 80, 470);

	problems.forEach((problem, index) => {
		const column = index % 2;
		const row = Math.floor(index / 2);
		const x = 80 + column * 480;
		const y = 560 + row * 150;
		const mark: Mark = problem.answer ? markOf(problem.answer.score, problem.answer.pitari) : "batsu";
		paintMark(ctx, mark, x, y, 110, hanamaruFor(currentPublicId(), problem.id));
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
	await document.fonts.ready;
	const [element, ctx] = canvas();
	paper(ctx, 0);
	const { all } = profile;
	const average = all.answers ? all.scoreSum / all.answers : 0;
	const pitariRate = all.answers ? (all.pitari / all.answers) * 100 : 0;

	ctx.textAlign = "left";
	ctx.fillStyle = INK;
	ctx.font = `800 60px ${MINCHO}`;
	ctx.fillText("成績表", 72, 150);
	ctx.font = `700 46px ${GOTHIC}`;
	ctx.fillText(displayName(profile.name, profile.publicId), 72, 240);

	const rows: [string, string][] = [
		["回答数", `${all.answers}問`],
		["平均点", `${average.toFixed(1)}点`],
		["ピタリ率", `${pitariRate.toFixed(1)}%`],
	];
	rows.forEach(([label, value], index) => {
		const y = 460 + index * 230;
		ctx.fillStyle = MUTED;
		ctx.font = `700 40px ${GOTHIC}`;
		ctx.fillText(label, 80, y - 70);
		ctx.fillStyle = RED_INK;
		ctx.font = `600 130px ${HAND}`;
		ctx.fillText(value, 80, y + 60);
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
export async function openShare(element: HTMLCanvasElement, text: string, url: string, name: string): Promise<void> {
	const file = await toFile(element, name);
	const preview = h("img", { class: "share__preview", src: URL.createObjectURL(file), alt: "共有する画像" });
	const dialog = h("dialog", { class: "share" }) as HTMLDialogElement;
	const close = () => dialog.close();
	dialog.addEventListener("close", () => {
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
							await navigator.share({ files: [file], text: `${text}\n${url}` });
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
		window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, "_blank", "noopener");
	};
	actions.append(
		h("button", { class: "ghost-button", type: "button", onclick: save }, "画像を保存"),
		h("button", { class: "ghost-button", type: "button", onclick: postToX }, "Xに投稿"),
		h("button", { class: "ghost-button", type: "button", onclick: close }, "閉じる"),
	);
	dialog.append(
		preview,
		h("p", { class: "share__note" }, "Xに投稿するときは、保存した画像を投稿画面で添付してください。"),
		actions,
	);
	document.body.append(dialog);
	dialog.showModal();
}
