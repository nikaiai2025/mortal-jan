// Answer window: pick a tile or an option, then confirm (two steps).

import type { Pai, Question } from "../shared/types";
import { h } from "./dom";
import { errorMessage } from "./errors";
import { actionElement } from "./labels";
import { questionText } from "./scene";
import { sound } from "./sound";
import { tileElement } from "./tiles";

/** `onConfirm` sends the answer; if it rejects, the window becomes usable again. */
export function answerWindow(question: Question, onConfirm: (action: string) => Promise<void>): HTMLElement {
	const legal = new Set(question.choices.map((c) => c.action));
	let selected: { action: string; button: HTMLElement } | null = null;
	let riichi = false;

	const confirm = h("button", { class: "stamp-button", type: "button", disabled: true }, "確定");
	const hint = h("p", { class: "answer__hint" }, question.kind === "call" ? "選択肢を選んでください" : "切る牌を選んでください");
	const message = h("p", { class: "form-message", role: "alert" });

	function select(action: string | null, button: HTMLElement | null): void {
		selected?.button.classList.remove("is-selected");
		selected = action && button ? { action, button } : null;
		selected?.button.classList.add("is-selected");
		confirm.disabled = !selected;
		confirm.replaceChildren(...(selected ? [actionElement(selected.action, question, "tile tile--confirm"), "で確定"] : ["確定"]));
		sound.unlock();
		if (selected) sound.tap(0.18, 1800);
	}

	const body = h("div", { class: "answer__body" });
	/** Re-enable the controls that are legal in the current state. */
	let enable: () => void;
	if (question.kind === "call") {
		const options = h("div", { class: "answer__options" });
		for (const choice of question.choices) {
			const button = h("button", { class: "option", type: "button" }, actionElement(choice.action, question, "tile tile--option"));
			button.addEventListener("click", () => select(choice.action, button));
			options.append(button);
		}
		body.append(options);
		enable = () => {
			for (const button of options.querySelectorAll("button")) button.disabled = false;
		};
	} else {
		const tiles: { pai: Pai; button: HTMLButtonElement }[] = [];
		const actionFor = (pai: Pai) => `${riichi ? "r" : "d"}:${pai}`;
		const hand = h("div", { class: "answer__hand" });
		const addTile = (pai: Pai, drawn: boolean) => {
			const button = h("button", { class: `hand-tile${drawn ? " hand-tile--drawn" : ""}`, type: "button" }, tileElement(pai, "tile tile--hand"));
			button.addEventListener("click", () => select(actionFor(pai), button));
			tiles.push({ pai, button });
			hand.append(button);
		};
		question.scene.hand.forEach((pai) => addTile(pai, false));
		if (question.scene.drawn) addTile(question.scene.drawn, true);
		let toggle: HTMLButtonElement | null = null;
		enable = () => {
			if (toggle) toggle.disabled = false;
			for (const { pai, button } of tiles) button.disabled = !legal.has(actionFor(pai));
		};
		const refresh = () => {
			enable();
			if (!selected) return;
			const next = actionFor(selected.action.slice(2));
			if (legal.has(next)) select(next, selected.button);
			else select(null, null);
		};
		if (question.kind === "riichi") {
			toggle = h("button", { class: "riichi-toggle", type: "button", "aria-pressed": "false" }, "リーチ");
			const button = toggle;
			button.addEventListener("click", () => {
				riichi = !riichi;
				button.setAttribute("aria-pressed", String(riichi));
				button.classList.toggle("is-on", riichi);
				sound.unlock();
				sound.tap(0.2, 1200);
				refresh();
			});
			body.append(h("div", { class: "answer__riichi" }, button, h("span", {}, "リーチするなら押してから牌を選ぶ")));
		}
		body.append(hand);
		refresh();
	}

	confirm.addEventListener("click", async () => {
		if (!selected) return;
		sound.unlock();
		message.textContent = "";
		confirm.disabled = true;
		for (const button of body.querySelectorAll("button")) button.disabled = true;
		try {
			await onConfirm(selected.action);
		} catch (error) {
			console.error(error);
			message.textContent = errorMessage(error);
			enable();
			confirm.disabled = !selected;
		}
	});

	return h(
		"section",
		{ class: "answer", "aria-label": "回答" },
		h("h2", { class: "answer__question" }, questionText(question.kind, question.choices)),
		hint,
		body,
		message,
		h("div", { class: "answer__actions" }, confirm),
	);
}
