// Question → answer → grading → result. Used by free play, shared links and problem sets.

import { markOf } from "../shared/rules";
import type { Candidate, ProblemResponse, Question, Result } from "../shared/types";
import { currentPublicId, post } from "./api";
import { answerWindow } from "./answer";
import { board, type Board } from "./board";
import { h, replace } from "./dom";
import { Sequence, markLayer, reveal } from "./effects";
import { hanamaruFor } from "./marks";
import { DIFFICULTY_LABELS, KIND_LABELS, actionElement } from "./labels";
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
	h("p", { class: "rules-note" }, "天鳳段位戦準拠の東南戦。対戦相手の3人も同じAI（Mortal）です。", h("a", { href: "/rules" }, "ルール"));

function heading(question: Question, options: PlayOptions): HTMLElement {
	return h(
		"header",
		{ class: "sheet__head" },
		h("h1", { class: "sheet__title" }, h("small", {}, "第"), String(question.id), h("small", {}, "問")),
		h("span", { class: `kind kind--${question.kind}` }, KIND_LABELS[question.kind]),
		options.progress ? h("span", { class: "sheet__progress" }, options.progress) : null,
	);
}

async function showQuestion(root: HTMLElement, question: Question, options: PlayOptions): Promise<void> {
	const view = await board(question);
	const answer = answerWindow(question, view, async (action) => {
		const from = options.from ? `?from=${encodeURIComponent(options.from)}` : "";
		const response = await post<ProblemResponse>(`/api/problems/${question.id}/answer${from}`, { action });
		if (response.state !== "result") return showProblem(root, response, options);
		options.onAnswered?.(response.result);
		await grade(root, view, answer, response.result, options, true);
	});
	replace(root, heading(question, options), h("div", { class: "play" }, h("div", {}, view.element, rulesNote()), answer));
}

async function showResult(root: HTMLElement, result: Result, options: PlayOptions): Promise<void> {
	const view = await board(result);
	view.setHand({ selected: chosenSlot(result) });
	const placeholder = h("div");
	replace(root, heading(result, options), h("div", { class: "play" }, h("div", {}, view.element, rulesNote()), placeholder));
	await grade(root, view, placeholder, result, options, false);
}

async function grade(root: HTMLElement, view: Board, replaced: HTMLElement, result: Result, options: PlayOptions, animate: boolean): Promise<void> {
	const sequence = new Sequence();
	if (!animate || matchMedia("(prefers-reduced-motion: reduce)").matches) sequence.skip();
	const layer = markLayer(markOf(result.answer.score, result.answer.pitari), result.answer.score, hanamaruFor(currentPublicId(), result.id));
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
		// The bars over the hand: one per way of discarding the tile.
		meta.append(
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
		const url = `${location.origin}/q/${result.id}${publicId ? `?from=${publicId}` : ""}`;
		const text = `${SITE_NAME} 第${result.id}問 ${result.answer.score}点${result.answer.pitari ? "（ピタリ！）" : ""}\nあなたならどうする？ ${HASHTAG}`;
		await openShare(await problemCard(result, result), text, url, `mortal-nanikiru-${result.id}.png`);
	};

	return h(
		"section",
		{ class: "result", "aria-label": "結果" },
		h(
			"div",
			{ class: "result__answers" },
			h("div", { class: "result__line" }, h("span", { class: "result__label" }, "あなた"), actionElement(answer.action, result, "tile tile--result")),
			h("div", { class: "result__line" }, h("span", { class: "result__label" }, "AI"), actionElement(evaluation.best, result, "tile tile--result")),
		),
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
