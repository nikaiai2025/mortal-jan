import { t } from "./i18n";
// Answer window: pick a tile on the board (or an option for calls), then confirm (two steps).

import type { Question } from "../shared/types";
import type { Board } from "./board";
import { h } from "./dom";
import { errorMessage } from "./errors";
import { actionElement } from "./labels";
import { handTiles, questionText } from "./scene";
import { sound } from "./sound";

export interface AnswerDraft { action: string | null; index: number | null; riichi: boolean; }
const drafts = new WeakMap<HTMLElement, () => AnswerDraft>();
export function answerDraft(root: HTMLElement): AnswerDraft | undefined { return drafts.get(root)?.(); }

/** `onConfirm` sends the answer; if it rejects, the window becomes usable again. */
export function answerWindow(question: Question, view: Board, onConfirm: (action: string) => Promise<void>, initial?: AnswerDraft): HTMLElement {
	const legal = new Set(question.choices.map((c) => c.action));
	let selected: string | null = initial?.action && legal.has(initial.action) ? initial.action : null;
	let selectedIndex: number | null = initial?.index ?? null;
	let riichi = initial?.riichi ?? false;
	let locked = false;

	const confirm = h("button", { class: "stamp-button", type: "button", disabled: true }, t("確定", "Confirm"));
	const message = h("p", { class: "form-message answer__message", role: "alert" });
	const body = h("div", { class: "answer__body" });

	const showSelection = () => {
		confirm.disabled = !selected || locked;
		confirm.replaceChildren(...(selected ? [actionElement(selected, question, "tile tile--confirm"), t("で確定", " Confirm")] : [t("確定", "Confirm")]));
	};
	const choose = (action: string | null) => {
		selected = action;
		sound.unlock();
		if (action) sound.tap(0.18, 1800);
		showSelection();
	};

	/** Enable controls that are legal in the current state (after a failed send too). */
	let enable: () => void;
	let hint: string;
	if (question.kind === "call") {
		hint = t("選んで確定を押す", "Choose an option, then confirm");
		const options = h("div", { class: "answer__options" });
		const buttons = question.choices.map((choice) => {
			const button = h("button", { class: selected === choice.action ? "option is-selected" : "option", type: "button", "aria-pressed": String(selected === choice.action) }, actionElement(choice.action, question, "tile tile--option"));
			button.addEventListener("click", () => {
				for (const other of buttons) {
					other.classList.toggle("is-selected", other === button);
					other.setAttribute("aria-pressed", String(other === button));
				}
				choose(choice.action);
			});
			return button;
		});
		options.append(...buttons);
		body.append(options);
		enable = () => {
			for (const button of buttons) button.disabled = false;
		};
	} else {
		hint = question.kind === "riichi" ? t("リーチするなら押してから、手牌をタップして選ぶ", "To declare riichi, turn it on first. Then tap a tile to discard.") : t("手牌をタップして選ぶ", "Tap a tile in your hand to discard");
		const tiles = handTiles(question.scene);
		const actionFor = (index: number) => `${riichi ? "r" : "d"}:${tiles[index]}`;
		const enabled = () => tiles.map((_, index) => legal.has(actionFor(index)));
		const redraw = () => view.setHand({ selected: selectedIndex, enabled: enabled() });
		const pick = (index: number) => {
			if (locked || !legal.has(actionFor(index))) return;
			selectedIndex = selectedIndex === index ? null : index;
			choose(selectedIndex === null ? null : actionFor(selectedIndex));
			redraw();
		};
		if (question.kind === "riichi") {
			const toggle = h("button", { class: riichi ? "riichi-toggle is-on" : "riichi-toggle", type: "button", "aria-pressed": String(riichi) }, t("リーチ", "Riichi"));
			toggle.addEventListener("click", () => {
				riichi = !riichi;
				toggle.setAttribute("aria-pressed", String(riichi));
				toggle.classList.toggle("is-on", riichi);
				sound.unlock();
				sound.tap(0.2, 1200);
				if (selectedIndex !== null && !legal.has(actionFor(selectedIndex))) selectedIndex = null;
				choose(selectedIndex === null ? null : actionFor(selectedIndex));
				redraw();
			});
			body.append(toggle);
		}
		enable = () => {
			view.onHandTap(pick);
			redraw();
		};
		enable();
	}

	confirm.addEventListener("click", async () => {
		if (!selected || locked) return;
		sound.unlock();
		message.textContent = "";
		locked = true;
		window.dispatchEvent(new CustomEvent("answer-submitting", { detail: true }));
		showSelection();
		for (const button of body.querySelectorAll("button")) button.disabled = true;
		view.onHandTap(null);
		try {
			await onConfirm(selected);
		} catch (error) {
			console.error(error);
			message.textContent = errorMessage(error);
			locked = false;
			for (const button of body.querySelectorAll("button")) button.disabled = false;
			enable();
			showSelection();
		} finally {
			window.dispatchEvent(new CustomEvent("answer-submitting", { detail: false }));
		}
	});

	showSelection();
	const element = h(
		"section",
		{ class: `answer answer--${question.kind}`, "aria-label": t("回答", "Answer") },
		h(
			"div",
			{ class: "answer__prompt" },
			h("h2", { class: "answer__question" }, questionText(question.kind)),
			h("p", { class: "answer__hint" }, hint),
		),
		body.childElementCount ? body : null,
		h("div", { class: "answer__actions" }, confirm),
		message,
	);
	drafts.set(element, () => ({ action: selected, index: selectedIndex, riichi }));
	return element;
}
