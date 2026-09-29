// Results mapped onto the own hand (bars over each tile, the discarded tile).

import type { Result } from "../shared/types";
import { type HandBar, handTiles } from "./scene";

/** The hand tile the player discarded (the first copy of that tile); null for calls. */
export function chosenSlot(result: Result): number | null {
	if (result.kind === "call") return null;
	const index = handTiles(result.scene).indexOf(result.answer.action.slice(2));
	return index >= 0 ? index : null;
}

/** Mortal evaluation per hand tile: its dama discard and, when legal, riichi with it. */
export function handBars(result: Result): HandBar[] {
	const p = new Map(result.evaluation.candidates.map((c) => [c.action, c.p]));
	return handTiles(result.scene).map((pai) => ({
		dama: p.get(`d:${pai}`),
		riichi: p.get(`r:${pai}`),
		best: result.evaluation.best === `d:${pai}` || result.evaluation.best === `r:${pai}`,
	}));
}
