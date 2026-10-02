// How the question page picks the next problem: at random or in number order, within a theme.
// Kept in this browser; a change applies from the next problem.

import { SET_THEMES, SET_THEME_LABELS, type PickMode, type SetTheme } from "../shared/rules";
import { h } from "./dom";

const KEY = "mortal-jan.pick";

export interface PickState {
	mode: PickMode;
	theme: SetTheme;
	/** In number order: the problem answered last, per theme; the next unanswered one above it comes next. */
	after: Partial<Record<SetTheme, number>>;
}

const DEFAULT: PickState = { mode: "random", theme: "all", after: {} };

export function loadPick(): PickState {
	try {
		const raw = localStorage.getItem(KEY);
		const stored = raw ? (JSON.parse(raw) as Partial<PickState>) : null;
		if (stored && (stored.mode === "random" || stored.mode === "order") && SET_THEMES.includes(stored.theme as SetTheme)) {
			return { mode: stored.mode, theme: stored.theme as SetTheme, after: typeof stored.after === "object" && stored.after ? stored.after : {} };
		}
	} catch {
		// storage unavailable
	}
	return DEFAULT;
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
	pick.mode === "order" ? `/api/problems/next?theme=${pick.theme}&after=${pick.after[pick.theme] ?? 0}` : `/api/problems/current?theme=${pick.theme}`;

/**
 * After answering a problem that `asked` (the pick in force when it was shown) chose in number order,
 * continue that theme after it. The controls may have changed meanwhile; that applies to the next problem only.
 */
export function advancePick(asked: PickState, id: number): void {
	if (asked.mode !== "order") return;
	const current = loadPick();
	savePick({ ...current, after: { ...current.after, [asked.theme]: id } });
}

/** The controls under the problem: how the next problem is chosen, and a jump to a numbered problem. */
export function pickerControls(navigate: (path: string) => void): HTMLElement {
	const pick = loadPick();
	const select = (name: string, options: [string, string][], value: string, onchange: (value: string) => void) =>
		h(
			"select",
			{ name, "aria-label": name === "mode" ? "次の問題の選び方" : "テーマ", onchange: (event: Event) => onchange((event.target as HTMLSelectElement).value) },
			...options.map(([v, label]) => h("option", { value: v, selected: v === value }, label)),
		);
	const mode = select(
		"mode",
		[
			["random", "ランダム"],
			["order", "番号順"],
		],
		pick.mode,
		(value) => savePick({ ...loadPick(), mode: value as PickMode }),
	);
	const theme = select(
		"theme",
		SET_THEMES.map((t) => [t, SET_THEME_LABELS[t]]),
		pick.theme,
		(value) => savePick({ ...loadPick(), theme: value as SetTheme }),
	);
	const number = h("input", { type: "number", name: "number", min: 1, step: 1, inputMode: "numeric", placeholder: "番号", "aria-label": "問題番号" });
	const jump = h(
		"form",
		{
			class: "picker__jump",
			onsubmit: (event: Event) => {
				event.preventDefault();
				const id = Number(number.value);
				if (Number.isInteger(id) && id >= 1) navigate(`/q/${id}`);
			},
		},
		h("label", {}, "第", number, "問"),
		h("button", { class: "ghost-button ghost-button--small", type: "submit" }, "開く"),
	);
	return h("div", { class: "picker" }, h("span", { class: "picker__label" }, "次の問題"), mode, theme, jump);
}
