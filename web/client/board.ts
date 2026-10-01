// The problem image on the page: a crisp canvas that follows its box, an overlay for marks,
// buttons over the own hand, where a discard is chosen, and the band above the hand for its question.

import type { Question } from "../shared/types";
import { h } from "./dom";
import { type HandBar, type HandView, RAISE, SCENE_WIDTH, drawScene, handBand, handSlots, preloadScene, sceneHeight } from "./scene";
import { tileLabel } from "./tiles";

export interface Board {
	element: HTMLElement;
	overlay(layer: HTMLElement): void;
	/** Redraw the own hand with this selection / enabled state. */
	setHand(view: HandView): void;
	/** Tapping a hand tile calls back with its index; null stops listening. */
	onHandTap(listener: ((index: number) => void) | null): void;
	/** Show content in the band above the hand; null clears it. */
	prompt(content: HTMLElement | null): void;
	/** Call choices and confirmation below the hand, on an extending felt surface. */
	answer(content: HTMLElement | null): void;
	/** Grow evaluation bars above the hand; they jump to full height once `skipped()` is true. */
	showBars(bars: HandBar[], skipped: () => boolean): Promise<void>;
}

const percent = (value: number, whole: number) => `${(value / whole) * 100}%`;

export async function board(question: Question): Promise<Board> {
	await Promise.all([preloadScene(question.scene, question.choices), document.fonts.ready]);
	const height = sceneHeight();
	const canvas = h("canvas", { class: "board__canvas", role: "img", "aria-label": `第${question.id}問の局面` });
	const band = handBand();
	const promptBox = h("div", { class: "board__prompt" });
	Object.assign(promptBox.style, { top: percent(band.top, height), height: percent(band.bottom - band.top, height) });
	// The prompt comes after the tile buttons: it lies over a raised tile's reach, and the keyboard reaches it after a tile.
	const controls = h("div", { class: "board__controls" }, promptBox);
	const overlayBox = h("div", { class: "board__overlay" });
	const sceneBox = h("div", { class: "board__scene", style: { aspectRatio: `${SCENE_WIDTH} / ${height}` } }, controls, overlayBox);
	const answerBox = h("div", { class: "board__answer", hidden: true });
	const surface = h("div", { class: "board__surface" }, canvas, sceneBox, answerBox);
	const element = h("figure", { class: "board" }, surface);
	let hand: HandView = { selected: null };
	let hovered: number | null = null;
	let listener: ((index: number) => void) | null = null;

	const paint = () => {
		const ctx = canvas.getContext("2d");
		if (ctx) drawScene(ctx, question.scene, canvas.width, { problemId: question.id, kind: question.kind, height: canvas.height * SCENE_WIDTH / canvas.width, hand: { ...hand, hovered } });
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
		const ratio = Math.min(window.devicePixelRatio || 1, 3);
		const size = Math.round(width * ratio);
		const pixelHeight = Math.round(canvas.clientHeight * ratio);
		if (canvas.width === size && canvas.height === pixelHeight) return;
		canvas.width = size;
		canvas.height = pixelHeight;
		paint();
	};
	observer.observe(surface);

	// One button over each hand tile; its hit area reaches above the tile for fingers.
	const buttons = handSlots(question.scene).map((slot) => {
		const button = h("button", { class: "board__tile", type: "button", "aria-label": `${tileLabel(slot.pai)}を選ぶ`, "aria-pressed": "false" });
		Object.assign(button.style, {
			left: percent(slot.x, SCENE_WIDTH),
			top: percent(slot.y, height),
			width: percent(slot.w, SCENE_WIDTH),
			height: percent(slot.h, height),
		});
		button.style.setProperty("--order", String(slot.index));
		button.style.setProperty("--raise", percent(-RAISE, slot.h));
		button.addEventListener("click", () => listener?.(slot.index));
		button.addEventListener("pointerenter", (event) => {
			if (event.pointerType !== "mouse" || button.disabled) return;
			hovered = slot.index;
			paint();
		});
		button.addEventListener("pointerleave", () => {
			if (hovered !== slot.index) return;
			hovered = null;
			paint();
		});
		return button;
	});

	return {
		element,
		overlay: (layer) => overlayBox.replaceChildren(layer),
		prompt: (content) => promptBox.replaceChildren(...(content ? [content] : [])),
		answer(content) {
			answerBox.replaceChildren(...(content ? [content] : []));
			answerBox.hidden = !content;
		},
		setHand(view) {
			hand = view;
			buttons.forEach((button, index) => {
				button.disabled = view.enabled ? !view.enabled[index] : false;
				button.setAttribute("aria-pressed", String(view.selected === index));
			});
			if (hovered !== null && buttons[hovered].disabled) hovered = null;
			element.classList.toggle("is-picked", view.selected !== null);
			paint();
		},
		onHandTap(next) {
			listener = next;
			hovered = null;
			for (const button of buttons) {
				if (next) promptBox.before(button);
				else button.remove();
			}
			paint();
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
