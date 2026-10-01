import "../client/style.css";
import { h } from "../client/dom";
import { Sequence, markLayer } from "../client/effects";
import { HANAMARU_ODDS, type HanamaruStyle } from "../client/marks";
import { sound } from "../client/sound";
import type { Mark } from "../shared/rules";

const cases: [Mark, number, HanamaruStyle?][] = [
	...(Object.keys(HANAMARU_ODDS) as HanamaruStyle[]).map((style): [Mark, number, HanamaruStyle] => ["hanamaru", 100, style]),
	["maru", 84],
	["sankaku", 52],
	["batsu", 7],
];
const grid = h("div", { style: { display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px", padding: "12px" } });
const layers = cases.map(([mark, score, style]) => {
	const layer = markLayer(mark, score, style);
	const label = style ? `${mark} / ${style}（${HANAMARU_ODDS[style]}%）` : mark;
	grid.append(
		h(
			"figure",
			{ class: "board", style: { margin: "0" } },
			h("div", { style: { aspectRatio: "1", background: "#1b5741" } }),
			h("div", { class: "board__overlay" }, layer.element),
			h("figcaption", { style: { position: "absolute", left: "8px", bottom: "6px", color: "#fff", fontSize: "12px" } }, label),
		),
	);
	return layer;
});
const play = async () => {
	sound.unlock();
	for (const layer of layers) await layer.play(new Sequence());
};
document.body.append(h("button", { class: "stamp-button", onclick: play, id: "play" }, "再生"), grid);
