import type { Difficulty, Question } from "../shared/types";
import { h } from "./dom";
import { tileElement, tileLabel, tileOrder } from "./tiles";

export const DIFFICULTY_LABELS: Record<Difficulty, string> = { easy: "かんたん", normal: "ふつう", hard: "むずかしい" };
const CALL_LABELS: Record<string, string> = { chi_low: "チー", chi_mid: "チー", chi_high: "チー", pon: "ポン", pass: "スルー" };

/** An answer drawn with tiles, e.g. [リーチ][3萬] or [ポン][5筒][5筒][5筒]. */
export function actionElement(action: string, question: Question, tileClass = "tile tile--small"): HTMLElement {
	const wrap = h("span", { class: "action" });
	if (action.startsWith("d:") || action.startsWith("r:")) {
		if (action.startsWith("r:")) wrap.append(h("span", { class: "action__tag action__tag--riichi" }, "リーチ"));
		wrap.append(tileElement(action.slice(2), tileClass));
		return wrap;
	}
	wrap.append(h("span", { class: "action__tag" }, CALL_LABELS[action] ?? action));
	const choice = question.choices.find((c) => c.action === action);
	const target = question.scene.target?.pai;
	if (choice?.consumed && target) {
		// The meld in tile order, with the called discard marked.
		const tiles = [{ pai: target, called: true }, ...choice.consumed.map((pai) => ({ pai, called: false }))];
		tiles.sort((a, b) => tileOrder(a.pai) - tileOrder(b.pai));
		for (const { pai, called } of tiles) wrap.append(tileElement(pai, called ? `${tileClass} tile--called` : tileClass));
	}
	return wrap;
}

/** Plain-text answer for share texts and screen readers. */
export function actionText(action: string, question: Question): string {
	if (action.startsWith("d:")) return tileLabel(action.slice(2));
	if (action.startsWith("r:")) return `リーチ${tileLabel(action.slice(2))}`;
	const choice = question.choices.find((c) => c.action === action);
	const tiles = choice?.consumed?.map(tileLabel).join("") ?? "";
	return `${CALL_LABELS[action] ?? action}${tiles ? `(${tiles})` : ""}`;
}
