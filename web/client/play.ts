// Question → answer → grading → result. Used by free play, shared links and problem sets.

import { markOf } from "../shared/rules";
import type { Candidate, ProblemResponse, Question, Result } from "../shared/types";
import { currentPublicId, post } from "./api";
import { answerWindow } from "./answer";
import { board, type Board } from "./board";
import { h, replace } from "./dom";
import { Sequence, markLayer, reveal } from "./effects";
import { hanamaruFor } from "./marks";
import { DIFFICULTY_LABELS, actionElement } from "./labels";
import { chosenSlot, handBars } from "./evaluation";
import { HASHTAG, SITE_NAME, openShare, problemCard } from "./share";

export interface PlayOptions {
	/** Extra heading content, e.g. set progress. */
	progress?: string;
	from: string | null;
	nextLabel: string;
	onNext(): void;
	onAnswered?(result: Result): void;
}

export async function showProblem(root: HTMLElement, response: ProblemResponse, options: PlayOptions): Promise<void> {
	switch (response.state) {
		case "question":
			return showQuestion(root, response.question, options);
		case "result":
			return showResult(root, response.result, options);
		case "locked":
			replace(root, 
				h(
					"section",
					{ class: "notice" },
					h("h2", {}, "解答中の問題があります"),
					h("p", {}, `先に第${response.currentId}問を解いてください。1問ずつ順番に解く決まりです。`),
					h("a", { class: "stamp-button", href: `/q/${response.currentId}` }, `第${response.currentId}問へ`),
				),
			);
			return;
		case "finished":
			replace(root, h("section", { class: "notice" }, h("h2", {}, "全問解きました"), h("p", {}, "すべての問題に回答済みです。")));
	}
}

const rulesNote = () =>
	h(
		"p",
		{ class: "rules-note" },
		"東南戦（半荘戦）　4人ともガチレベルの打ち手",
		h("br"),
		"赤ドラあり（5萬・5筒・5索に各1枚）。喰いタン・後付けあり。一発・裏ドラ・槓ドラあり。",
		h("br"),
		"暗い表示はツモ切り",
		h("br"),
		h("a", { href: "/rules" }, "詳細ルール"),
	);

function heading(options: PlayOptions): HTMLElement | null {
	return options.progress ? h("header", { class: "sheet__head" }, h("span", { class: "sheet__progress" }, options.progress)) : null;
}

/** The board, under it the answer or the result, then the rules. */
const play = (view: Board, below: HTMLElement) => h("div", { class: "play" }, view.element, below, rulesNote());

async function showQuestion(root: HTMLElement, question: Question, options: PlayOptions): Promise<void> {
	const view = await board(question);
	const answer = answerWindow(question, view, async (action) => {
		const from = options.from ? `?from=${encodeURIComponent(options.from)}` : "";
		const response = await post<ProblemResponse>(`/api/problems/${question.id}/answer${from}`, { action });
		if (response.state !== "result") return showProblem(root, response, options);
		options.onAnswered?.(response.result);
		await grade(root, view, below, response.result, options, true);
	});
	const below = h("div");
	if (question.kind === "call") {
		view.prompt(h("div", { class: "answer answer--call" }, answer.querySelector<HTMLElement>(".answer__prompt")));
		view.answer(answer);
	} else {
		view.prompt(answer);
	}
	replace(root, heading(options), play(view, below));
}

async function showResult(root: HTMLElement, result: Result, options: PlayOptions): Promise<void> {
	const view = await board(result);
	const placeholder = h("div");
	replace(root, heading(options), play(view, placeholder));
	await grade(root, view, placeholder, result, options, false);
}

async function grade(root: HTMLElement, view: Board, replaced: HTMLElement, result: Result, options: PlayOptions, animate: boolean): Promise<void> {
	// The hand shows the answer only, also right after answering (not the dimmed state of the question).
	view.prompt(null);
	view.answer(null);
	view.setHand({ selected: chosenSlot(result) });
	const sequence = new Sequence();
	if (!animate || matchMedia("(prefers-reduced-motion: reduce)").matches) sequence.skip();
	const layer = markLayer(markOf(result.answer.score, result.answer.pitari), result.answer.score, hanamaruFor(currentPublicId(), result.id, result.difficulty));
	view.overlay(layer.element);
	const card = resultCard(result, options);
	const rows = Array.from(card.children);
	if (!sequence.isSkipped) for (const row of rows) (row as HTMLElement).style.opacity = "0";
	// While grading, a tap only skips ahead; the invisible buttons must not fire.
	card.inert = true;
	replaced.replaceWith(card);

	const skip = () => sequence.skip();
	root.addEventListener("pointerdown", skip);
	await layer.play(sequence);
	if (result.kind !== "call") {
		// The marks stay where they were written; the evaluation rises from the hand below them.
		await sequence.pause(250);
		await view.showBars(handBars(result), () => sequence.isSkipped);
	}
	await reveal(sequence, rows);
	root.removeEventListener("pointerdown", skip);
	card.inert = false;
	// Tapping the board fades the marks so the position can be studied.
	view.element.title = "タップで印を薄くする";
	view.element.addEventListener("click", () => view.element.classList.toggle("is-mark-faded"));
}

function candidateRows(result: Result): Candidate[] {
	const shown = result.evaluation.candidates.filter((c, i) => i < 3 || c.p >= 0.01).slice(0, 6);
	const mine = result.evaluation.candidates.find((c) => c.action === result.answer.action);
	if (mine && !shown.includes(mine)) shown.push(mine);
	return shown;
}

function resultCard(result: Result, options: PlayOptions): HTMLElement {
	const { answer, evaluation } = result;
	const list = h("ol", { class: "candidates" });
	for (const candidate of candidateRows(result)) {
		const isMine = candidate.action === answer.action;
		const isBest = candidate.action === evaluation.best;
		const percent = candidate.p * 100;
		list.append(
			h(
				"li",
				{ class: `candidate${isMine ? " is-mine" : ""}${isBest ? " is-best" : ""}` },
				h("span", { class: "candidate__action" }, actionElement(candidate.action, result)),
				h(
					"span",
					{ class: "candidate__bar", "aria-label": `AI評価 ${percent.toFixed(1)}%` },
					h("span", { class: "candidate__fill", style: { width: `${Math.max(percent, 0.5)}%` } }),
				),
				h("span", { class: "candidate__percent" }, percent < 0.1 ? "0%" : `${percent.toFixed(percent < 10 ? 1 : 0)}%`),
				h("span", { class: "candidate__score" }, `${candidate.score}点`),
				isMine ? h("span", { class: "candidate__who" }, "あなた") : null,
			),
		);
	}

	const meta = h(
		"dl",
		{ class: "result__meta" },
		h("dt", {}, "AIの判定"),
		h("dd", {}, DIFFICULTY_LABELS[result.difficulty]),
		h("dt", {}, "みんなの平均"),
		h("dd", {}, result.human ? `${result.human.average.toFixed(1)}点（${result.human.answers}人）` : "集計中"),
	);
	if (result.kind === "riichi") {
		// The board shows the chosen tile, not whether it was a riichi; the bars over the hand: one per way of discarding the tile.
		meta.append(
			h("dt", {}, "あなた"),
			h("dd", {}, answer.action.startsWith("r:") ? "リーチ" : "ダマ"),
			h("dt", {}, "グラフ"),
			h("dd", { class: "bars-legend" }, h("i", { class: "bars-legend__dama" }), "ダマ", h("i", { class: "bars-legend__riichi" }), "リーチ"),
		);
	}
	if (result.sharer) {
		meta.append(
			h("dt", {}, `${result.sharer.name}さん`),
			h("dd", {}, actionElement(result.sharer.action, result), ` ${result.sharer.score}点`),
		);
	}

	const share = async () => {
		const publicId = currentPublicId();
		const problemUrl = `${location.origin}/q/${result.id}`;
		const shareText = (includeResult: boolean) => `${SITE_NAME} 第${result.id}問${includeResult ? ` ${result.answer.score}点${result.answer.pitari ? "（ピタリ！）" : ""}` : ""}\nあなたならどうする？ ${HASHTAG}`;
		await openShare(
			await problemCard(result, result),
			shareText(true),
			`${problemUrl}${publicId ? `?from=${publicId}` : ""}`,
			`mortal-nanikiru-${result.id}.png`,
			async () => ({ element: await problemCard(result, result, false), text: shareText(false), url: problemUrl }),
		);
	};

	return h(
		"section",
		{ class: "result", "aria-label": "結果" },
		result.kind === "call" ? h("div", { class: "result__list" }, h("h3", {}, "候補ごとのAI評価"), list) : null,
		meta,
		h(
			"div",
			{ class: "result__actions" },
			h("button", { class: "ghost-button", type: "button", onclick: share }, "結果を共有"),
			h("button", { class: "stamp-button", type: "button", onclick: () => options.onNext() }, options.nextLabel),
		),
	);
}
