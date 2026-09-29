// The grading moment: the red pen draws the mark, writes the score, and stamps ピタリ.

import type { Mark } from "../shared/rules";
import { h, wait } from "./dom";
import { MARK_BOX, RED_INK, STROKE_WIDTH, markStrokes } from "./marks";
import { sound } from "./sound";

const SVG_NS = "http://www.w3.org/2000/svg";

/** Runs animations in order; skip() jumps every remaining step to its end. */
export class Sequence {
	private skipped = false;
	private running = new Set<Animation>();
	private release: (() => void) | null = null;
	private readonly skipSignal = new Promise<void>((resolve) => (this.release = resolve));

	get isSkipped(): boolean {
		return this.skipped;
	}

	skip(): void {
		if (this.skipped) return;
		this.skipped = true;
		for (const animation of this.running) animation.finish();
		sound.stop();
		this.release?.();
	}

	async animate(element: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions): Promise<void> {
		const animation = element.animate(keyframes, { fill: "forwards", ...options });
		if (this.skipped) animation.finish();
		this.running.add(animation);
		await animation.finished.catch(() => undefined);
		this.running.delete(animation);
	}

	pause(ms: number): Promise<void> {
		return this.skipped ? Promise.resolve() : Promise.race([wait(ms), this.skipSignal]);
	}

	sound(play: () => void): void {
		if (!this.skipped) play();
	}
}

export interface MarkLayer {
	element: HTMLElement;
	play(sequence: Sequence): Promise<void>;
}

/** Overlay for the board: mark, handwritten score and (for pitari) a seal. */
export function markLayer(mark: Mark, score: number): MarkLayer {
	const svg = document.createElementNS(SVG_NS, "svg");
	svg.setAttribute("viewBox", `0 0 ${MARK_BOX} ${MARK_BOX}`);
	svg.setAttribute("class", "grade__mark");
	svg.setAttribute("aria-hidden", "true");
	const paths = markStrokes(mark).map((stroke) => {
		const path = document.createElementNS(SVG_NS, "path");
		path.setAttribute("d", stroke.d);
		path.setAttribute("fill", "none");
		path.setAttribute("stroke", RED_INK);
		path.setAttribute("stroke-width", String(STROKE_WIDTH));
		path.setAttribute("stroke-linecap", "round");
		path.setAttribute("stroke-linejoin", "round");
		path.style.visibility = "hidden";
		svg.appendChild(path);
		return { path, duration: stroke.duration };
	});
	const scoreText = h("div", { class: "grade__score" }, String(score), h("small", {}, "点"));
	const seal = mark === "hanamaru" ? h("div", { class: "grade__seal" }, "ピタリ") : null;
	const element = h("div", { class: `grade grade--${mark}`, role: "img", "aria-label": `${score}点` }, svg, scoreText, seal);

	async function play(sequence: Sequence): Promise<void> {
		for (const { path, duration } of paths) {
			const length = path.getTotalLength();
			path.style.strokeDasharray = `${length}`;
			path.style.visibility = "visible";
			sequence.sound(() => sound.pen(duration));
			await sequence.animate(path, [{ strokeDashoffset: length }, { strokeDashoffset: 0 }], {
				duration,
				easing: "cubic-bezier(0.4, 0.05, 0.3, 1)",
			});
			await sequence.pause(70);
		}
		await sequence.pause(120);
		sequence.sound(() => sound.pen(380));
		await sequence.animate(scoreText, [{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)" }], {
			duration: 380,
			easing: "ease-out",
		});
		if (seal) {
			await sequence.pause(160);
			sequence.sound(() => sound.stamp());
			await sequence.animate(
				seal,
				[
					{ opacity: 0, transform: "scale(1.9) rotate(-18deg)" },
					{ opacity: 1, transform: "scale(0.94) rotate(-12deg)", offset: 0.7 },
					{ opacity: 1, transform: "scale(1) rotate(-12deg)" },
				],
				{ duration: 260, easing: "cubic-bezier(0.2, 0.8, 0.3, 1)" },
			);
		}
	}

	return { element, play };
}

/** Reveal children one after another. */
export async function reveal(sequence: Sequence, elements: Element[]): Promise<void> {
	for (const element of elements) {
		void sequence.animate(element, [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], {
			duration: 260,
			easing: "ease-out",
		});
		await sequence.pause(70);
	}
}
