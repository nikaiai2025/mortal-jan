import { t, getLocale, initialLocale, setLocale, localePath, type Locale } from "./i18n";
import { EN_SITE_NAME, EN_NAV_LABELS } from "../shared/site-en";
import { localizeProblem } from "./play";
import "./style.css";
import { h } from "./dom";
import { errorMessage } from "./errors";
import { SET_THEMES, type SetTheme } from "../shared/rules";
import { type App, localizeScreen, dailyPlay, freePlay, meLink, problemPage, profilePage, rankingPage, rulesPage, setList, setPlay } from "./screens";
import { effectsSetting } from "./effects";
import { SITE_NAME, NAV_LINKS, footerContent, publicContent } from "../shared/site";
import { updatePageMeta } from "./seo";
import { sound } from "./sound";
import { ApiError, currentPublicId, requestPending, SESSION_KEY, reportInitialArrival, sessionIsPersistent, startNewPlayer, syncSessionFromStorage } from "./api";
import { recoveryPage, recoveryPanel } from "./recovery";
import { startAcquisition, measurementControl } from "./acquisition";

let localeStorage: Storage | undefined;
try { localeStorage = localStorage; } catch { /* language still works without storage */ }
setLocale(initialLocale(location.search, localeStorage));

startAcquisition(new URL(location.href), document.referrer);
void reportInitialArrival();

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
	[/^\/about$/, (root) => { root.innerHTML = publicContent("/about", getLocale()); return Promise.resolve(); }],
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
		history.pushState(null, "", localePath(path));
		void render();
	},
	refresh: () => void render(),
};

/**
 * Each render draws into its own container. A newer render detaches the older
 * container, so a slow response of a previous page can no longer change the screen.
 */
async function render(): Promise<void> {
	const view = h("div", { class: "view" }, h("p", { class: "loading" }, t("読み込み中…", "Loading\u2026")));
	main.replaceChildren(view);
	window.scrollTo(0, 0);
	updateNav();
	updateStorageWarning();
	updatePageMeta(location.pathname);
	footer.innerHTML = footerContent(location.pathname, getLocale());
	const route = routes.find(([pattern]) => pattern.test(location.pathname));
	if (!route) {
		view.replaceChildren(h("section", { class: "notice" }, h("h2", {}, t("ページが見つかりません", "Page not found"))));
		return;
	}
	try {
		await route[1](view, location.pathname.match(route[0]) as RegExpMatchArray, app);
		measurementControl(view);
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
				h("h2", {}, t("表示できませんでした", "Could not load this page")),
				h("p", {}, errorMessage(error)),
				h("button", { class: "stamp-button", type: "button", onclick: app.refresh }, t("再読み込み", "Reload")),
			),
		);
	}
}

function authNotice(error?: unknown): HTMLElement {
	const message = h("p", {}, error ? errorMessage(error) : t("この端末では成績を利用できません。復活の呪文で復旧してください。", "Your progress is unavailable on this device. Use your recovery code to restore it."));
	const button = h("button", { class: "ghost-button", type: "button" }, t("新しく始める", "Start fresh"));
	button.addEventListener("click", async () => {
		if (!window.confirm(t("別の利用者として新しく始めます。元の成績は引き継がれません。よろしいですか？", "Start as a new player? Your current progress will not carry over."))) return;
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
		h("h2", {}, t("成績の復旧が必要です", "Recover your progress")), message,
		h("div", { class: "recovery-actions" }, h("a", { class: "ghost-button", href: "/recover" }, t("呪文で復旧する", "Use a recovery code")), button),
	);
}

const storageWarning = h("p", { class: "storage-warning", role: "status", hidden: true },
	t("利用者情報をブラウザーに保存できていません。画面を閉じる前に、成績ページで復活の呪文を発行・保存してください。", "Your player details could not be saved in this browser. Before closing the page, create and save a recovery code from your stats page."),
);
function updateStorageWarning(): void {
	storageWarning.hidden = sessionIsPersistent();
}

const navLinks: [string, string | (() => string)][] = NAV_LINKS.map(([label, href]) => [label, href === "/u/me" ? meLink : href]);
const nav = h("nav", { class: "site-nav", "aria-label": t("メニュー", "Menu") });

function updateNav(): void {
	nav.replaceChildren(
		...navLinks.map(([label, target], index) => {
			const href = typeof target === "string" ? target : target();
			const section = href.split("/").slice(0, 2).join("/"); // "/u/abc" → "/u"
			const current = href === "/" ? location.pathname === "/" : location.pathname.startsWith(section);
			return h("a", { href: localePath(href), class: current ? "is-current" : "", "aria-current": current ? "page" : undefined }, getLocale() === "en" ? EN_NAV_LABELS[index] : label);
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

const settings = h("div", { class: "settings" });
const language = h("select", { class: "language-select", "aria-label": "Language / 言語" },
	h("option", { value: "ja", lang: "ja" }, "日本語"),
	h("option", { value: "en", lang: "en" }, "English"),
);
language.value = getLocale();
const brand = h("a", { class: "brand", href: "/" });
function updateHeader(): void {
	brand.textContent = t(SITE_NAME, EN_SITE_NAME);
	brand.href = localePath("/");
	nav.setAttribute("aria-label", t("メニュー", "Menu"));
	settings.replaceChildren(
		language,
		settingToggle(t("演出", "Effects"), () => effectsSetting.enabled, (on) => effectsSetting.set(on)),
		settingToggle(t("音", "Sound"), () => sound.enabled, (on) => { sound.setEnabled(on); sound.unlock(); }),
	);
	storageWarning.textContent = t("利用者情報をブラウザーに保存できていません。画面を閉じる前に、成績ページで復活の呪文を発行・保存してください。", "Your player details could not be saved in this browser. Before closing the page, create and save a recovery code from your stats page.");
	updateNav();
	footer.innerHTML = footerContent(location.pathname, getLocale());
	updatePageMeta(location.pathname);
}

let switching = false;
let answering = false;
const updateLanguageBusy = () => { language.disabled = switching || answering || requestPending(); };
language.addEventListener("change", async () => {
	if (switching) return;
	switching = true;
	language.disabled = true;
	setLocale(language.value as Locale, localeStorage);
	history.replaceState(history.state, "", localePath(location.pathname + location.search + location.hash));
	updateHeader();
	try {
		// Redraw the same problem locally: no new assignment or answer request.
		const view = main.firstElementChild as HTMLElement | null;
		if (!view || !await localizeProblem(view)) {
			// Keep unsaved form input and the one-time recovery-code display in memory.
			const fields = Array.from(main.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea:not([readonly])"), field => field.value);
			const visibleSpell = main.querySelector<HTMLTextAreaElement>(".recovery-issued textarea")?.value;
			const player = currentPublicId();
			let localizedView = view;
			if (!view || !localizeScreen(view)) {
				const rendering = render();
				localizedView = main.firstElementChild as HTMLElement | null;
				await rendering;
			}
			// A newer navigation or session change owns the screen now.
			if (main.firstElementChild !== localizedView || currentPublicId() !== player) return;
			main.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea:not([readonly])").forEach((field, index) => {
				if (fields[index] !== undefined) field.value = fields[index];
			});
			if (visibleSpell) main.querySelector(".recovery-panel")?.replaceWith(recoveryPanel(true, visibleSpell));
		}
	} finally {
		switching = false;
		updateLanguageBusy();
		language.focus();
	}
});
window.addEventListener("answer-submitting", (event) => {
	answering = (event as CustomEvent<boolean>).detail;
	updateLanguageBusy();
});
window.addEventListener("request-busy", updateLanguageBusy);
updateLanguageBusy();
updateHeader();

document.getElementById("static-page")?.remove();
document.body.append(
	h("header", { class: "site-header" }, brand, nav, settings),
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
	const requested = url.searchParams.get("lang");
	if (requested === "ja" || requested === "en") { setLocale(requested, localeStorage); language.value = requested; updateHeader(); }
	app.navigate(url.pathname + url.search + url.hash);
});
window.addEventListener("popstate", () => {
	setLocale(initialLocale(location.search, localeStorage));
	language.value = getLocale();
	updateHeader();
	void render();
});
window.addEventListener("session-unauthorized", () => main.replaceChildren(authNotice()));
window.addEventListener("session-storage-failed", updateStorageWarning);
window.addEventListener("storage", (event) => {
	if (event.key !== SESSION_KEY && event.key !== null) return;
	syncSessionFromStorage();
	void render();
});

void render();
