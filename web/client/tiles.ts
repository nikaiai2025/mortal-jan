import type { Pai } from "../shared/types";

const SUITS: Record<string, string> = { m: "Man", p: "Pin", s: "Sou" };
const HONORS: Record<string, string> = { E: "Ton", S: "Nan", W: "Shaa", N: "Pei", P: "Haku", F: "Hatsu", C: "Chun" };
const SUIT_LABELS: Record<string, string> = { m: "萬", p: "筒", s: "索" };
const HONOR_LABELS: Record<string, string> = { E: "東", S: "南", W: "西", N: "北", P: "白", F: "發", C: "中" };

export const deaka = (pai: Pai): Pai => (pai.endsWith("r") ? pai.slice(0, 2) : pai);

/** Image URL of a tile face (drawn over /tiles/Front.svg). */
export function faceUrl(pai: Pai): string {
	if (pai in HONORS) return `/tiles/${HONORS[pai]}.svg`;
	const suit = SUITS[pai[1]];
	return pai.endsWith("r") ? `/tiles/${suit}5-Dora.svg` : `/tiles/${suit}${pai[0]}.svg`;
}

export const FRONT_URL = "/tiles/Front.svg";
export const BACK_URL = "/tiles/Back.svg";

/** Sort key in hand order: man, pin, sou, honors; a red five right after the plain five. */
export function tileOrder(pai: Pai): number {
	if (pai in HONORS) return 30 + Object.keys(HONORS).indexOf(pai);
	return "mps".indexOf(pai[1]) * 10 + Number(pai[0]) + (pai.endsWith("r") ? 0.5 : 0);
}

/** Human-readable tile name, e.g. "3萬", "赤5筒", "東". */
export function tileLabel(pai: Pai): string {
	if (pai in HONOR_LABELS) return HONOR_LABELS[pai];
	return `${pai.endsWith("r") ? "赤" : ""}${pai[0]}${SUIT_LABELS[pai[1]]}`;
}

const images = new Map<string, Promise<HTMLImageElement>>();

export function loadImage(url: string): Promise<HTMLImageElement> {
	let image = images.get(url);
	if (!image) {
		image = new Promise((resolve, reject) => {
			const element = new Image();
			element.onload = () => resolve(element);
			element.onerror = () => {
				images.delete(url); // allow a retry
				reject(new Error(`failed to load ${url}`));
			};
			element.src = url;
		});
		images.set(url, image);
	}
	return image;
}

const loaded = new Map<string, HTMLImageElement>();

/** Load every image a set of tiles needs; afterwards `tileImage` is synchronous. */
export async function preloadTiles(pais: Iterable<Pai>): Promise<void> {
	const urls = new Set([FRONT_URL, BACK_URL, ...Array.from(pais, faceUrl)]);
	await Promise.all(
		Array.from(urls, async (url) => {
			loaded.set(url, await loadImage(url));
		}),
	);
}

export function tileImage(url: string): HTMLImageElement {
	const image = loaded.get(url);
	if (!image) throw new Error(`tile image not preloaded: ${url}`);
	return image;
}

/** A tile as an HTML element (face over the tile body). */
export function tileElement(pai: Pai, className = "tile"): HTMLSpanElement {
	const span = document.createElement("span");
	span.className = className;
	span.setAttribute("role", "img");
	span.setAttribute("aria-label", tileLabel(pai));
	const face = document.createElement("img");
	face.src = faceUrl(pai);
	face.alt = "";
	face.draggable = false;
	span.appendChild(face);
	return span;
}
