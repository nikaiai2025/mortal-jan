import "../client/style.css";
import { h } from "../client/dom";
import { Sequence, markLayer } from "../client/effects";
import { sound } from "../client/sound";

const cases: [Parameters<typeof markLayer>[0], number][] = [
	["hanamaru", 100],
	["maru", 84],
	["sankaku", 52],
	["batsu", 7],
];
const grid = h("div", { style: { display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px", padding: "12px" } });
const layers = cases.map(([mark, score]) => {
	const layer = markLayer(mark, score);
	grid.append(h("figure", { class: "board", style: { margin: "0" } }, h("div", { style: { aspectRatio: "1", background: "#1b5741" } }), h("div", { class: "board__overlay" }, layer.element)));
	return layer;
});
const play = async () => {
	sound.unlock();
	for (const layer of layers) await layer.play(new Sequence());
};
document.body.append(h("button", { class: "stamp-button", onclick: play, id: "play" }, "再生"), grid);
