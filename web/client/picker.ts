// How the question page picks the next problem: at random, or in number order from the problem
// answered last. Kept in this browser; switched beside "次の問題へ" after answering.

import type { PickMode } from "../shared/rules";
import { h } from "./dom";

const KEY = "mortal-jan.pick";

export interface PickState {
	mode: PickMode;
	/** In number order: the problem answered last; the next unanswered one above it comes next. */
	after: number;
}

export function loadPick(): PickState {
	try {
		const raw = localStorage.getItem(KEY);
		const stored = raw ? (JSON.parse(raw) as Partial<PickState>) : null;
		if (stored && (stored.mode === "random" || stored.mode === "order")) {
			return { mode: stored.mode, after: Number.isInteger(stored.after) && (stored.after as number) >= 0 ? (stored.after as number) : 0 };
		}
	} catch {
		// storage unavailable
	}
	return { mode: "random", after: 0 };
}

export function savePick(pick: PickState): void {
	try {
		localStorage.setItem(KEY, JSON.stringify(pick));
	} catch {
		// storage unavailable: the choice lasts until the page is closed
	}
}

/** API path of the next problem under this pick. */
export const pickPath = (pick: PickState): string =>
	pick.mode === "order" ? `/api/problems/next?theme=all&after=${pick.after}` : "/api/problems/current";

/**
 * After answering a problem that `asked` (the pick in force when it was shown) chose in number order,
 * continue after it. A switch made meanwhile applies to the next problem only.
 */
export function advancePick(asked: PickState, id: number): void {
	if (asked.mode === "order") savePick({ ...loadPick(), after: id });
}

/** Segmented switch ランダム | 番号順 for the next problem; saves on tap. */
export function modeSwitch(): HTMLElement {
	const buttons = new Map<PickMode, HTMLButtonElement>();
	const show = (mode: PickMode) => {
		for (const [value, button] of buttons) button.setAttribute("aria-pressed", String(value === mode));
	};
	const choose = (mode: PickMode) => {
		savePick({ ...loadPick(), mode });
		show(mode);
	};
	for (const [mode, label] of [
		["random", "ランダム"],
		["order", "番号順"],
	] as const) {
		buttons.set(mode, h("button", { type: "button", onclick: () => choose(mode) }, label));
	}
	show(loadPick().mode);
	return h("div", { class: "segmented", role: "group", "aria-label": "次の問題の選び方" }, ...buttons.values());
}
