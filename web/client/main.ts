import "./style.css";
import { h } from "./dom";
import { errorMessage } from "./errors";
import { type App, freePlay, meLink, problemPage, profilePage, rankingPage, setList, setPlay } from "./screens";
import { SITE_NAME } from "./share";
import { sound } from "./sound";

const main = h("main", { class: "sheet", id: "main" });

type Render = (root: HTMLElement, match: RegExpMatchArray, app: App) => Promise<void>;

const routes: [RegExp, Render][] = [
	[/^\/$/, (root, _, app) => freePlay(root, app)],
	[/^\/q\/(\d+)$/, (root, m, app) => problemPage(root, Number(m[1]), app)],
	[/^\/sets$/, (root) => setList(root, Number(new URLSearchParams(location.search).get("page") ?? 1) || 1)],
	[/^\/sets\/(\d+)$/, (root, m, app) => setPlay(root, Number(m[1]), app)],
	[/^\/u\/([a-z0-9]+)$/, (root, m, app) => profilePage(root, m[1], app)],
	[/^\/ranking$/, (root) => rankingPage(root)],
];

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
	["問題集", "/sets"],
	["成績", meLink],
	["ランキング", "/ranking"],
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

function soundToggle(): HTMLButtonElement {
	const button = h("button", { class: "sound-toggle", type: "button" });
	const update = () => {
		button.textContent = sound.enabled ? "音 ON" : "音 OFF";
		button.setAttribute("aria-pressed", String(sound.enabled));
	};
	button.addEventListener("click", () => {
		sound.setEnabled(!sound.enabled);
		sound.unlock();
		update();
	});
	update();
	return button;
}

document.body.append(
	h("header", { class: "site-header" }, h("a", { class: "brand", href: "/" }, SITE_NAME), nav, soundToggle()),
	main,
	h(
		"footer",
		{ class: "site-footer" },
		h(
			"p",
			{},
			"評価モデル: 第三者配布のMortal用重み mortal-298k（公式モデルではありません） / ",
			h("a", { href: "https://github.com/Equim-chan/Mortal" }, "Mortal"),
			"（AGPL-3.0） / ",
			h("a", { href: "https://github.com/nikaiai2025/mortal-jan" }, "このサイトのソースコード"),
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
