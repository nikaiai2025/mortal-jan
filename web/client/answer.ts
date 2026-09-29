// Answer window: pick a tile on the board (or an option for calls), then confirm (two steps).

import type { Question } from "../shared/types";
import type { Board } from "./board";
import { h } from "./dom";
import { errorMessage } from "./errors";
import { actionElement } from "./labels";
import { handTiles, questionText } from "./scene";
import { sound } from "./sound";
import { tileLabel } from "./tiles";

/** `onConfirm` sends the answer; if it rejects, the window becomes usable again. */
export function answerWindow(question: Question, view: Board, onConfirm: (action: string) => Promise<void>): HTMLElement {
	const legal = new Set(question.choices.map((c) => c.action));
	let selected: string | null = null;
	let locked = false;

	const confirm = h("button", { class: "stamp-button", type: "button", disabled: true }, "確定");
	const message = h("p", { class: "form-message", role: "alert" });
	const body = h("div", { class: "answer__body" });

	const showSelection = () => {
		confirm.disabled = !selected || locked;
		confirm.replaceChildren(...(selected ? [actionElement(selected, question, "tile tile--confirm"), "で確定"] : ["確定"]));
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
		hint = "選択肢を選んでください";
		const options = h("div", { class: "answer__options" });
		const buttons = question.choices.map((choice) => {
			const button = h("button", { class: "option", type: "button" }, actionElement(choice.action, question, "tile tile--option"));
			button.addEventListener("click", () => {
				for (const other of buttons) other.classList.toggle("is-selected", other === button);
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
		hint = "盤面の自分の手牌をタップして、切る牌を選んでください";
		const tiles = handTiles(question.scene);
		let riichi = false;
		let selectedIndex: number | null = null;
		const actionFor = (index: number) => `${riichi ? "r" : "d"}:${tiles[index]}`;
		const enabled = () => tiles.map((_, index) => legal.has(actionFor(index)));
		const redraw = () => view.setHand({ selected: selectedIndex, enabled: locked ? tiles.map(() => false) : enabled() });
		const pick = (index: number) => {
			if (locked || !legal.has(actionFor(index))) return;
			selectedIndex = selectedIndex === index ? null : index;
			choose(selectedIndex === null ? null : actionFor(selectedIndex));
			redraw();
		};
		// The same choice for keyboards and screen readers.
		const accessible = h(
			"div",
			{ class: "sr-only" },
			...tiles.map((pai, index) => h("button", { type: "button", onclick: () => pick(index) }, `${tileLabel(pai)}を選ぶ`)),
		);
		body.append(accessible);
		if (question.kind === "riichi") {
			const toggle = h("button", { class: "riichi-toggle", type: "button", "aria-pressed": "false" }, "リーチ");
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
			body.append(h("div", { class: "answer__riichi" }, toggle, h("span", {}, "リーチするなら押してから牌を選ぶ")));
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
		}
	});

	return h(
		"section",
		{ class: "answer", "aria-label": "回答" },
		h("h2", { class: "answer__question" }, questionText(question.kind, question.choices)),
		h("p", { class: "answer__hint" }, hint),
		body,
		message,
		h("div", { class: "answer__actions" }, confirm),
	);
}
