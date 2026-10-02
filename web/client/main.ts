import "./style.css";
import { h } from "./dom";
import { errorMessage } from "./errors";
import { SET_THEMES, type SetTheme } from "../shared/rules";
import { type App, dailyPlay, freePlay, meLink, problemPage, profilePage, rankingPage, rulesPage, setList, setPlay } from "./screens";
import { effectsSetting } from "./effects";
import { SITE_NAME } from "./share";
import { sound } from "./sound";

const main = h("main", { class: "sheet", id: "main" });

type Render = (root: HTMLElement, match: RegExpMatchArray, app: App) => Promise<void>;

const routes: [RegExp, Render][] = [
	[/^\/$/, (root, _, app) => freePlay(root, app)],
	[/^\/q\/(\d+)$/, (root, m, app) => problemPage(root, Number(m[1]), app)],
	[/^\/daily$/, (root, _, app) => dailyPlay(root, app)],
	[/^\/sets$/, (root, _, app) => setList(root, themeParam(), Number(new URLSearchParams(location.search).get("page") ?? 1) || 1, app)],
	[/^\/sets\/([a-z]+)\/(\d+)$/, (root, m, app) => setPlay(root, m[1] as SetTheme, Number(m[2]), app)],
	[/^\/rules$/, (root) => rulesPage(root)],
	[/^\/u\/([a-z0-9]+)$/, (root, m, app) => profilePage(root, m[1], app)],
	[/^\/ranking$/, (root) => rankingPage(root)],
];

function themeParam(): SetTheme {
	const theme = new URLSearchParams(location.search).get("theme");
	return SET_THEMES.includes(theme as SetTheme) ? (theme as SetTheme) : "all";
}

const app: App = {
	navigate(path) {
		history.pushState(null, "", path);
		void render();
	},
	refresh: () => void render(),
};

/**
 * Each render draws into its own container. A newer render detaches the older
 * container, so a slow response of a previous page can no longer change the screen.
 */
async function render(): Promise<void> {
	const view = h("div", { class: "view" }, h("p", { class: "loading" }, "読み込み中…"));
	main.replaceChildren(view);
	window.scrollTo(0, 0);
	updateNav();
	const route = routes.find(([pattern]) => pattern.test(location.pathname));
	if (!route) {
		view.replaceChildren(h("section", { class: "notice" }, h("h2", {}, "ページが見つかりません")));
		return;
	}
	try {
		await route[1](view, location.pathname.match(route[0]) as RegExpMatchArray, app);
	} catch (error) {
		console.error(error);
		view.replaceChildren(
			h(
				"section",
				{ class: "notice" },
				h("h2", {}, "表示できませんでした"),
				h("p", {}, errorMessage(error)),
				h("button", { class: "stamp-button", type: "button", onclick: app.refresh }, "再読み込み"),
			),
		);
	}
}

const navLinks: [string, string | (() => string)][] = [
	["出題", "/"],
	["今日の10問", "/daily"],
	["問題集", "/sets"],
	["成績", meLink],
	["ランキング", "/ranking"],
	["ルール", "/rules"],
];
const nav = h("nav", { class: "site-nav", "aria-label": "メニュー" });

function updateNav(): void {
	nav.replaceChildren(
		...navLinks.map(([label, target]) => {
			const href = typeof target === "string" ? target : target();
			const section = href.split("/").slice(0, 2).join("/"); // "/u/abc" → "/u"
			const current = href === "/" ? location.pathname === "/" : location.pathname.startsWith(section);
			return h("a", { href, class: current ? "is-current" : "", "aria-current": current ? "page" : undefined }, label);
		}),
	);
}

/** A header switch that reads "<label> ON" or "<label> OFF". */
function settingToggle(label: string, isOn: () => boolean, turn: (on: boolean) => void): HTMLButtonElement {
	const button = h("button", { class: "setting-toggle", type: "button" });
	const update = () => {
		button.textContent = `${label} ${isOn() ? "ON" : "OFF"}`;
		button.setAttribute("aria-pressed", String(isOn()));
	};
	button.addEventListener("click", () => {
		turn(!isOn());
		update();
	});
	update();
	return button;
}

const settings = h(
	"div",
	{ class: "settings" },
	settingToggle("演出", () => effectsSetting.enabled, (on) => effectsSetting.set(on)),
	settingToggle("音", () => sound.enabled, (on) => {
		sound.setEnabled(on);
		sound.unlock();
	}),
);

document.body.append(
	h("header", { class: "site-header" }, h("a", { class: "brand", href: "/" }, SITE_NAME), nav, settings),
	main,
	h(
		"footer",
		{ class: "site-footer" },
		h(
			"p",
			{},
			"制作: ",
			h("a", { href: "https://x.com/shika_bakudan" }, "@shika_bakudan"),
			"（AIで開発。Cloudflareの無料枠で動かしていて、サーバー代は0円です。使用ツール: Claude, ChatGPT）",
			h("br"),
			"採点: 麻雀AI ",
			h("a", { href: "https://github.com/Equim-chan/Mortal" }, "Mortal"),
			"（第三者配布の重み mortal-298k） / ",
			h("a", { href: "https://github.com/nikaiai2025/mortal-jan" }, "ソースコードは公開しています"),
			"（AGPL-3.0）",
		),
	),
);

// Same-origin links navigate without reloading.
document.addEventListener("click", (event) => {
	const link = (event.target as Element).closest("a");
	if (!link || link.target || link.hasAttribute("download") || event.metaKey || event.ctrlKey || event.shiftKey) return;
	const url = new URL(link.href, location.href);
	if (url.origin !== location.origin) return;
	event.preventDefault();
	app.navigate(url.pathname + url.search);
});
window.addEventListener("popstate", () => void render());

void render();
