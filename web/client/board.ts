// The problem image on the page: a crisp canvas that follows its box, an overlay for marks,
// and the own hand as the place where a discard is chosen.

import type { Question } from "../shared/types";
import { h } from "./dom";
import { type HandBar, type HandView, SCENE_HEIGHT, SCENE_WIDTH, drawScene, handSlotAt, preloadScene } from "./scene";

export interface Board {
	element: HTMLElement;
	overlay(layer: HTMLElement): void;
	/** Redraw the own hand with this selection / enabled state. */
	setHand(view: HandView): void;
	/** Tapping a hand tile calls back with its index; null stops listening. */
	onHandTap(listener: ((index: number) => void) | null): void;
	/** Grow evaluation bars above the hand; they jump to full height once `skipped()` is true. */
	showBars(bars: HandBar[], skipped: () => boolean): Promise<void>;
}

export async function board(question: Question): Promise<Board> {
	await Promise.all([preloadScene(question.scene, question.choices), document.fonts.ready]);
	const canvas = h("canvas", { class: "board__canvas", role: "img", "aria-label": `第${question.id}問の局面` });
	const overlayBox = h("div", { class: "board__overlay" });
	const element = h("figure", { class: "board" }, canvas, overlayBox);
	let hand: HandView = { selected: null };
	let listener: ((index: number) => void) | null = null;

	const paint = () => {
		const ctx = canvas.getContext("2d");
		if (ctx) drawScene(ctx, question.scene, canvas.width, { problemId: question.id, hand });
	};
	const observer = new ResizeObserver(() => resize());
	const resize = () => {
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
		canvas.height = Math.round((size * SCENE_HEIGHT) / SCENE_WIDTH);
		paint();
	};
	observer.observe(canvas);

	canvas.addEventListener("click", (event) => {
		if (!listener) return;
		const scale = SCENE_WIDTH / canvas.clientWidth;
		const index = handSlotAt(question.scene, event.offsetX * scale, event.offsetY * scale);
		if (index !== null) listener(index);
	});

	return {
		element,
		overlay: (layer) => overlayBox.replaceChildren(layer),
		setHand(view) {
			hand = view;
			paint();
		},
		onHandTap(next) {
			listener = next;
			element.classList.toggle("is-choosing", next !== null);
		},
		showBars(bars, skipped) {
			const duration = 700;
			const start = performance.now();
			return new Promise((resolve) => {
				const frame = (now: number) => {
					const t = skipped() ? 1 : Math.min(1, (now - start) / duration);
					hand = { ...hand, bars, barProgress: 1 - (1 - t) ** 3 };
					paint();
					if (t < 1 && canvas.isConnected) requestAnimationFrame(frame);
					else resolve();
				};
				requestAnimationFrame(frame);
			});
		},
	};
}
