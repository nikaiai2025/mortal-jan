import "./style.css";
import { h } from "./dom";
import { errorMessage } from "./errors";
import { SET_THEMES, type SetTheme } from "../shared/rules";
import { type App, dailyPlay, freePlay, meLink, problemPage, profilePage, rankingPage, rulesPage, setList, setPlay } from "./screens";
import { effectsSetting } from "./effects";
import { SITE_NAME, NAV_LINKS, footerContent, publicContent } from "../shared/site";
import { updatePageMeta } from "./seo";
import { sound } from "./sound";
import { ApiError, SESSION_KEY, sessionIsPersistent, startNewPlayer, syncSessionFromStorage } from "./api";
import { recoveryPage } from "./recovery";

const main = h("main", { class: "sheet", id: "main" });
const footer = h("footer", { class: "site-footer" });

type Render = (root: HTMLElement, match: RegExpMatchArray, app: App) => Promise<void>;

const routes: [RegExp, Render][] = [
	[/^\/$/, (root, _, app) => freePlay(root, app)],
	[/^\/q\/(\d+)$/, (root, m, app) => problemPage(root, Number(m[1]), app)],
	[/^\/daily$/, (root, _, app) => dailyPlay(root, app)],
	[/^\/sets$/, (root, _, app) => setList(root, themeParam(), Number(new URLSearchParams(location.search).get("page") ?? 1) || 1, app)],
	[/^\/sets\/([a-z]+)\/(\d+)$/, (root, m, app) => setPlay(root, m[1] as SetTheme, Number(m[2]), app)],
	[/^\/rules$/, (root) => rulesPage(root)],
	[/^\/about$/, (root) => { root.innerHTML = publicContent("/about"); return Promise.resolve(); }],
	[/^\/recover$/, (root, _, app) => recoveryPage(root, app)],
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
	updateStorageWarning();
	updatePageMeta(location.pathname);
	footer.innerHTML = footerContent(location.pathname);
	const route = routes.find(([pattern]) => pattern.test(location.pathname));
	if (!route) {
		view.replaceChildren(h("section", { class: "notice" }, h("h2", {}, "ページが見つかりません")));
		return;
	}
	try {
		await route[1](view, location.pathname.match(route[0]) as RegExpMatchArray, app);
		updatePageMeta(location.pathname);
	} catch (error) {
		console.error(error);
		if (error instanceof ApiError && error.status === 401) {
			view.replaceChildren(authNotice(error));
			return;
		}
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

function authNotice(error?: unknown): HTMLElement {
	const message = h("p", {}, error ? errorMessage(error) : "この端末では成績を利用できません。復活の呪文で復旧してください。");
	const button = h("button", { class: "ghost-button", type: "button" }, "新しく始める");
	button.addEventListener("click", async () => {
		if (!window.confirm("別の利用者として新しく始めます。元の成績は引き継がれません。よろしいですか？")) return;
		button.disabled = true;
		try {
			await startNewPlayer();
			app.navigate("/");
		} catch (failure) {
			message.textContent = errorMessage(failure);
			button.disabled = false;
		}
	});
	return h("section", { class: "notice" },
		h("h2", {}, "成績の復旧が必要です"), message,
		h("div", { class: "recovery-actions" }, h("a", { class: "ghost-button", href: "/recover" }, "呪文で復旧する"), button),
	);
}

const storageWarning = h("p", { class: "storage-warning", role: "status", hidden: true },
	"利用者情報をブラウザーに保存できていません。画面を閉じる前に、成績ページで復活の呪文を発行・保存してください。",
);
function updateStorageWarning(): void {
	storageWarning.hidden = sessionIsPersistent();
}

const navLinks: [string, string | (() => string)][] = NAV_LINKS.map(([label, href]) => [label, href === "/u/me" ? meLink : href]);
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

document.getElementById("static-page")?.remove();
document.body.append(
	h("header", { class: "site-header" }, h("a", { class: "brand", href: "/" }, SITE_NAME), nav, settings),
	storageWarning,
	main,
	footer,
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
window.addEventListener("session-unauthorized", () => main.replaceChildren(authNotice()));
window.addEventListener("session-storage-failed", updateStorageWarning);
window.addEventListener("storage", (event) => {
	if (event.key !== SESSION_KEY && event.key !== null) return;
	syncSessionFromStorage();
	void render();
});

void render();
