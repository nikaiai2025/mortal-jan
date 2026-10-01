// Daily results as a bar chart: one column per day with answers (days without answers are left out).

import type { DailyStats } from "../shared/types";

const SVG_NS = "http://www.w3.org/2000/svg";
const COLUMN = 40;
const LEFT = 30;
const TOP = 22;
const PLOT = 150;
const HEIGHT = TOP + PLOT + 44;

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string | number>, text?: string): SVGElementTagNameMap[K] {
	const element = document.createElementNS(SVG_NS, tag);
	for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
	if (text !== undefined) element.textContent = text;
	return element;
}

const label = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

/** Average score per day (bars), with the date and the number of answers under each bar. */
export function dailyChart(days: DailyStats[]): HTMLElement {
	const width = days.length * COLUMN + 8;
	const bars = svg("svg", { width, height: HEIGHT, viewBox: `0 0 ${width} ${HEIGHT}`, role: "img", "aria-label": "1日ごとの平均点" });
	// The axis stays put while the bars scroll sideways.
	const axis = svg("svg", { width: LEFT, height: HEIGHT, viewBox: `0 0 ${LEFT} ${HEIGHT}`, "aria-hidden": "true" });
	for (const value of [0, 50, 100]) {
		const y = TOP + PLOT - (value / 100) * PLOT;
		bars.append(svg("line", { x1: 0, x2: width, y1: y, y2: y, class: "daily-chart__grid" }));
		axis.append(svg("text", { x: LEFT - 6, y: y + 4, class: "daily-chart__axis" }, String(value)));
	}
	days.forEach((day, i) => {
		const average = day.scoreSum / day.answers;
		const x = i * COLUMN + COLUMN / 2 + 4;
		const top = TOP + PLOT - (average / 100) * PLOT;
		const bar = svg("rect", { x: x - 12, y: top, width: 24, height: TOP + PLOT - top, rx: 3, class: "daily-chart__bar" });
		bar.append(svg("title", {}, `${label(day.date)} ${day.answers}問 平均${average.toFixed(1)}点 ピタリ${day.pitari}回`));
		bars.append(bar);
		bars.append(svg("text", { x, y: top - 5, class: "daily-chart__value" }, average.toFixed(0)));
		bars.append(svg("text", { x, y: TOP + PLOT + 17, class: "daily-chart__date" }, label(day.date)));
		bars.append(svg("text", { x, y: TOP + PLOT + 34, class: "daily-chart__count" }, `${day.answers}問`));
	});
	const scroller = document.createElement("div");
	scroller.className = "daily-chart__scroll";
	scroller.append(bars);
	const frame = document.createElement("div");
	frame.className = "daily-chart";
	frame.append(axis, scroller);
	// Show the latest days first when the chart is wider than the screen.
	requestAnimationFrame(() => (scroller.scrollLeft = scroller.scrollWidth));
	return frame;
}
