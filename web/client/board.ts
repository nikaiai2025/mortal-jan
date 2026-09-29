// The problem image on the page: a crisp canvas that follows its box, with an overlay for marks.

import type { Question } from "../shared/types";
import { h } from "./dom";
import { drawScene, preloadScene } from "./scene";

export interface Board {
	element: HTMLElement;
	overlay(layer: HTMLElement): void;
}

export async function board(question: Question): Promise<Board> {
	await Promise.all([preloadScene(question.scene, question.choices), document.fonts.ready]);
	const canvas = h("canvas", { class: "board__canvas", role: "img", "aria-label": `第${question.id}問の局面` });
	const overlayBox = h("div", { class: "board__overlay" });
	const element = h("figure", { class: "board" }, canvas, overlayBox);

	const observer = new ResizeObserver(() => draw());
	const draw = () => {
		if (!canvas.isConnected) {
			// The page moved on: release the observer and the bitmap.
			observer.disconnect();
			canvas.width = canvas.height = 0;
			return;
		}
		const width = canvas.clientWidth;
		if (!width) return;
		const size = Math.round(width * Math.min(window.devicePixelRatio || 1, 3));
		if (canvas.width === size) return;
		canvas.width = size;
		canvas.height = size;
		const ctx = canvas.getContext("2d");
		if (ctx) drawScene(ctx, question.scene, size, { problemId: question.id, kind: question.kind, choices: question.choices });
	};
	observer.observe(canvas);

	return { element, overlay: (layer) => overlayBox.replaceChildren(layer) };
}
