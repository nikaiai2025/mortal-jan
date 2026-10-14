import { localizedPlayerName } from "./player-label";
import { t } from "./i18n";
// Question → answer → grading → result. Used by free play, shared links and problem sets.

import { markOf } from "../shared/rules";
import type { Candidate, ProblemResponse, Question, Result } from "../shared/types";
import { currentPublicId, post } from "./api";
import { answerWindow, answerDraft, type AnswerDraft } from "./answer";
import { board, type Board } from "./board";
import { h, replace } from "./dom";
import { Sequence, effectsSetting, markLayer, reveal } from "./effects";
import { hanamaruFor } from "./marks";
import { DIFFICULTY_LABELS, actionElement } from "./labels";
import { chosenSlot, handBars } from "./evaluation";
import { openShare, problemCard } from "./share";
import { logViewer } from "./paifu";
import { comments, commentDraft, type CommentDraft } from "./comments";

export interface PlayOptions {
	/** Shown after the answer, never between the board and it: a message to the player, and set progress. */
	notice?: string;
	progress?: string;
	/** Free play: below the game-log button on PC, below Next on phones. */
	nextSwitch?: HTMLElement;
	from: string | null;
	nextLabel: string;
	onNext(): void;
	onAnswered?(result: Result): void;
}

const localizers = new WeakMap<HTMLElement, () => Promise<void>>();
/** A language switch must not fetch another random problem or submit an answer. */
export async function localizeProblem(root: HTMLElement): Promise<boolean> {
	const localize = localizers.get(root);
	if (!localize) return false;
	await localize();
	return true;
}

export async function showProblem(root: HTMLElement, response: ProblemResponse, options: PlayOptions, draft?: CommentDraft): Promise<void> {
	localizers.set(root, async () => {
		const answer = root.querySelector<HTMLElement>("section.answer");
		if (response.state === "question") await showQuestion(root, response.question, options, answer ? answerDraft(answer) : undefined, commentDraft(root));
		else await showProblem(root, response, options, commentDraft(root));
	});
	switch (response.state) {
		case "question":
			return showQuestion(root, response.question, options, undefined, draft);
		case "result":
			return showResult(root, response.result, options, draft);
		case "finished":
			replace(root, h("section", { class: "notice" }, h("h2", {}, t("全問解きました", "You’ve answered every problem")), h("p", {}, t("すべての問題に回答済みです。", "You’ve already answered all the problems."))));
	}
}

const rulesNote = (open: boolean) =>
	h(
		"details",
		{ class: "rules-note", open },
		h("summary", {}, t("ルール説明", "Game rules")),
		h("p", {},
			t("東南戦（半荘戦）・天鳳準拠　4人ともガチレベルの打ち手", "East–South game (hanchan), following Tenhou rules. All four players play at a competitive level."),
			h("br"),
			t("赤ドラあり（5萬・5筒・5索に各1枚）。喰いタン・後付けあり。一発・裏ドラ・槓ドラあり。", "One red five per suit. Open tanyao, atozuke, ippatsu, ura-dora and kan-dora are enabled."),
			h("br"),
			t("暗い表示はツモ切り", "Dimmed tiles were discarded straight from the draw."),
			h("br"),
			h("a", { href: "/rules" }, t("詳細ルール", "Full rules")),
		),
	);

function info(options: PlayOptions): HTMLElement | null {
	if (!options.notice && !options.progress) return null;
	return h(
		"p",
		{ class: "play__info" },
		options.notice ? h("span", { class: "play__notice" }, options.notice) : null,
		options.progress ? h("span", { class: "play__progress" }, options.progress) : null,
	);
}

/** The board first, so that nothing pushes it down; under it the answer or the result, then the info and the rules. */
const play = (root: HTMLElement, view: Board, below: HTMLElement, options: PlayOptions, id: number, draft?: CommentDraft) =>
	h("div", { class: "play" }, view.element, below, info(options), comments(id, draft), rulesNote(root.querySelector<HTMLDetailsElement>("details.rules-note")?.open ?? false));

async function showQuestion(root: HTMLElement, question: Question, options: PlayOptions, draft?: AnswerDraft, commentState?: CommentDraft): Promise<void> {
	const view = await board(question);
	const answer = answerWindow(question, view, async (action) => {
		const from = options.from ? `?from=${encodeURIComponent(options.from)}` : "";
		const response = await post<ProblemResponse>(`/api/problems/${question.id}/answer${from}`, { action });
		if (response.state !== "result") return showProblem(root, response, options);
		options.onAnswered?.(response.result);
		localizers.set(root, () => showProblem(root, response, options, commentDraft(root)));
		await grade(root, view, below, response.result, options, true);
	}, draft);
	// The question stays above the hand; call choices and confirmation go under the board.
	const below = question.kind === "call" ? answer : h("div");
	view.prompt(question.kind === "call" ? h("div", { class: "answer answer--call" }, answer.querySelector<HTMLElement>(".answer__prompt")) : answer);
	replace(root, play(root, view, below, options, question.id, commentState));
}

async function showResult(root: HTMLElement, result: Result, options: PlayOptions, draft?: CommentDraft): Promise<void> {
	const view = await board(result);
	const placeholder = h("div");
	replace(root, play(root, view, placeholder, options, result.id, draft));
	await grade(root, view, placeholder, result, options, false);
}

async function grade(root: HTMLElement, view: Board, replaced: HTMLElement, result: Result, options: PlayOptions, animate: boolean): Promise<void> {
	// The hand shows the answer only, also right after answering (not the dimmed state of the question).
	view.prompt(null);
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
	await layer.play(sequence, effectsSetting.enabled);
	if (result.kind !== "call") {
		// The marks stay where they were written; the evaluation rises from the hand below them.
		await sequence.pause(250);
		await view.showBars(handBars(result), () => sequence.isSkipped);
	}
	await reveal(sequence, rows);
	root.removeEventListener("pointerdown", skip);
	card.inert = false;
	// Tapping the board fades the marks so the position can be studied.
	view.element.title = t("タップで印を薄くする", "Tap to fade the marks");
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
					{ class: "candidate__bar", "aria-label": t(`AI評価 ${percent.toFixed(1)}%`, `AI evaluation ${percent.toFixed(1)}%`) },
					h("span", { class: "candidate__fill", style: { width: `${Math.max(percent, 0.5)}%` } }),
				),
				h("span", { class: "candidate__percent" }, percent < 0.1 ? "0%" : `${percent.toFixed(percent < 10 ? 1 : 0)}%`),
				h("span", { class: "candidate__score" }, t(`${candidate.score}点`, `${candidate.score} pts`)),
				isMine ? h("span", { class: "candidate__who" }, t("あなた", "You")) : null,
			),
		);
	}

	const judgment = [h("dt", {}, t("AIの判定", "AI difficulty")), h("dd", {}, DIFFICULTY_LABELS[result.difficulty])];
	const average = [
		h("dt", {}, t("みんなの平均", "Player average")),
		h("dd", {}, result.human ? t(`${result.human.average.toFixed(1)}点（${result.human.answers}人）`, `${result.human.average.toFixed(1)} pts (${result.human.answers} players)`) : t("集計中", "Collecting results")),
	];
	const meta = h(
		"dl",
		{ class: "result__meta" },
		...(result.kind === "call" ? [...judgment, ...average] : []),
	);
	if (result.kind === "riichi") {
		// The board shows the chosen tile, not whether it was a riichi; the bars over the hand: one per way of discarding the tile.
		meta.append(
			h("dt", {}, t("あなた", "You")),
			h("dd", {}, answer.action.startsWith("r:") ? t("リーチ", "Riichi") : t("ダマ", "Dama (no riichi)")),
			h("dt", {}, t("グラフ", "Chart")),
			h("dd", { class: "bars-legend" }, h("span", { class: "bars-legend__riichi", "aria-hidden": "true" }, t("リ", "R")), t("リーチ／無印はダマ", "Riichi / unmarked bars: no riichi")),
		);
	}
	if (result.sharer) {
		meta.append(
			h("dt", {}, t(`${localizedPlayerName(result.sharer.name, result.sharer.identity)}さん`, localizedPlayerName(result.sharer.name, result.sharer.identity))),
			h("dd", {}, actionElement(result.sharer.action, result), t(` ${result.sharer.score}点`, ` ${result.sharer.score} pts`)),
		);
	}

	const share = async () => {
		const publicId = currentPublicId();
		const problemUrl = `${location.origin}/q/${result.id}`;
		await openShare(
			await problemCard(result, result),
			t(`第${result.id}問`, `Problem ${result.id}`),
			`${problemUrl}${publicId ? `?from=${publicId}` : ""}`,
			`mortal-nanikiru-${result.id}.png`,
			async () => ({ element: await problemCard(result, result, false), url: problemUrl }),
		);
	};

	const nextSwitch = options.nextSwitch;
	nextSwitch?.classList.add("result__picker");
	const card = h(
		"section",
		{ class: "result", "aria-label": t("結果", "Results") },
		h("div", { class: "result__details" },
			logViewer(result, result.kind === "call"
				? h("h3", { class: "result__heading" }, t("候補ごとのAI評価", "AI evaluation by choice"))
				: h("div", { class: "result__summary" }, h("dl", { class: "result__meta" }, ...judgment), h("dl", { class: "result__meta" }, ...average)),
				nextSwitch),
			result.kind === "call" ? h("div", { class: "result__list" }, list) : null,
			meta.childElementCount ? meta : null,
		),
		h(
			"div",
			{ class: "result__actions" },
			h("button", { class: "ghost-button", type: "button", onclick: share }, t("結果を共有", "Share results")),
			h("button", { class: "stamp-button", type: "button", onclick: () => options.onNext() }, options.nextLabel),
		),
	);
	if (nextSwitch) {
		const controls = card.querySelector<HTMLElement>(".log-viewer__controls")!;
		const actions = card.querySelector<HTMLElement>(".result__actions")!;
		// Move the same control on rotation; its selection and handlers stay intact.
		const place = () => {
			const target = matchMedia("(max-width: 520px)").matches ? actions : controls;
			if (nextSwitch.parentElement !== target) target.append(nextSwitch);
		};
		place();
		const observer = new ResizeObserver(() => {
			if (!card.isConnected) return observer.disconnect();
			place();
		});
		observer.observe(card);
	}
	return card;
}
