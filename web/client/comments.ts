import { COMMENT_MAX_LENGTH } from "../shared/comments";
import type { Comment, CommentsResponse } from "../shared/types";
import { post, publicApi } from "./api";
import { h, replace } from "./dom";
import { errorMessage } from "./errors";
import { getLocale, t } from "./i18n";
import { localizedPlayerName } from "./player-label";

export interface CommentDraft {
	body: string;
	open: boolean;
	mode: "problem" | "all";
	response: CommentsResponse | null;
}

const drafts = new WeakMap<HTMLElement, CommentDraft>();
// Remember the PC view within this tab; each new problem gets a fresh input and list.
const desktopView: Pick<CommentDraft, "open" | "mode"> = { open: false, mode: "problem" };
const isDesktop = () => matchMedia("(min-width: 900px)").matches;
export function commentDraft(root: HTMLElement): CommentDraft | undefined {
	const section = root.querySelector<HTMLElement>(".comments");
	const state = section && drafts.get(section);
	if (!state) return undefined;
	return { ...state, body: section.querySelector<HTMLTextAreaElement>("textarea")!.value };
}

function commentRow(comment: Comment): HTMLElement {
	const date = new Date(comment.createdAt);
	const time = new Intl.DateTimeFormat(getLocale() === "en" ? "en-GB" : "ja-JP", {
		timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
	}).format(date);
	return h("li", { class: "comments__entry", "data-comment-id": comment.id },
		h("div", { class: "comments__meta" },
			h("a", { class: "comments__problem", href: `/q/${comment.problemId}` }, t(`第${comment.problemId}問`, `Problem ${comment.problemId}`)),
			h("span", { class: "comments__name" }, localizedPlayerName("", comment.player)),
			h("time", { dateTime: comment.createdAt, title: t(`投稿ID ${comment.id} · ${date.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}`, `Post ID ${comment.id} · ${date.toLocaleString("en-GB", { timeZone: "Asia/Tokyo" })}`) }, time),
		),
		h("p", { class: "comments__body" }, comment.body),
	);
}

/** The board is fetched only when opened; the problem context stays on screen. */
export function comments(problemId: number, draft?: CommentDraft): HTMLElement {
	const state: CommentDraft = draft ? { ...draft } : { body: "", open: false, mode: "problem", ...(isDesktop() ? desktopView : {}), response: null };
	const input = h("textarea", { rows: 2, value: state.body, placeholder: t("この問題へのコメント", "Comment on this problem"), "aria-label": t(`第${problemId}問へのコメント`, `Comment on problem ${problemId}`) });
	const counter = h("span", { class: "comments__count" });
	const message = h("p", { class: "comments__message", role: "status" });
	const submit = h("button", { class: "comments__post", type: "submit" }, t("投稿", "Post"));
	const panelId = `comments-panel-${problemId}`;
	const modesId = `comments-modes-${problemId}`;
	const toggle = h("button", { class: "comments__toggle", type: "button", "aria-expanded": String(state.open), "aria-controls": `${modesId} ${panelId}` }, t("コメント", "Comments"));
	const list = h("ol", { class: "comments__list" });
	const boardMessage = h("p", { class: "comments__message", role: "status" });
	const all = h("input", { type: "radio", name: modesId, value: "all" });
	const problem = h("input", { type: "radio", name: modesId, value: "problem" });
	const modes = h("div", { class: "comments__modes segmented", id: modesId, role: "radiogroup", "aria-label": t("表示モード", "Display mode"), hidden: !state.open },
		h("label", {}, all, t("全表示", "All problems")),
		h("label", {}, problem, t(`対象問題のみ（第${problemId}問）`, `This problem (${problemId})`)),
	);
	const header = h("div", { class: "comments__header" }, toggle, modes);
	const panel = h("div", { class: "comments__panel" }, boardMessage, list);
	const form = h("form", { class: "comments__form" },
		input,
		h("div", { class: "comments__actions" }, counter, submit), message,
	);
	const content = h("div", { class: "comments__content", id: panelId, hidden: !state.open }, form, panel);
	const section = h("section", { class: "comments", "aria-label": t("掲示板", "Comments board") }, header, content);
	drafts.set(section, state);
	let posting = false;
	let version = 0;
	function rememberView(): void {
		if (isDesktop()) Object.assign(desktopView, { open: state.open, mode: state.mode });
	}
	function updateInput(): void {
		const length = [...input.value].length;
		counter.textContent = `${length}/${COMMENT_MAX_LENGTH}`;
		input.setCustomValidity(length > COMMENT_MAX_LENGTH ? t(`${COMMENT_MAX_LENGTH}文字以内にしてください。`, `Use no more than ${COMMENT_MAX_LENGTH} characters.`) : "");
		submit.disabled = posting || !input.value.trim() || length > COMMENT_MAX_LENGTH;
	}
	function display(): void {
		all.checked = state.mode === "all";
		problem.checked = state.mode === "problem";
		replace(list, ...(state.response?.comments ?? []).map(commentRow));
	}
	async function load(): Promise<void> {
		const current = ++version;
		const query = state.mode === "problem" ? `?problem=${problemId}` : "";
		boardMessage.textContent = t("読み込み中…", "Loading…");
		display();
		try {
			const response = await publicApi<CommentsResponse>(`/api/comments${query}`);
			if (current !== version) return;
			state.response = response;
			boardMessage.textContent = state.response.comments.length ? "" : t("まだコメントはありません。", "No comments yet.");
		} catch (error) {
			if (current !== version) return;
			boardMessage.textContent = errorMessage(error);
		} finally {
			if (current === version) display();
		}
	}
	input.addEventListener("input", updateInput);
	form.addEventListener("submit", async (event) => {
		event.preventDefault();
		if (submit.disabled || posting) return;
		posting = true;
		input.readOnly = true;
		updateInput();
		message.textContent = t("投稿中…", "Posting…");
		try {
			await post<Comment>(`/api/problems/${problemId}/comments`, { body: input.value });
			input.value = "";
			state.body = "";
			state.response = null;
			message.textContent = "";
			if (state.open) await load();
		} catch (error) {
			message.textContent = errorMessage(error);
		} finally {
			posting = false;
			input.readOnly = false;
			updateInput();
		}
	});
	toggle.addEventListener("click", () => {
		state.open = !state.open;
		content.hidden = !state.open;
		modes.hidden = !state.open;
		toggle.setAttribute("aria-expanded", String(state.open));
		rememberView();
		if (state.open) void load();
	});
	for (const [radio, mode] of [[all, "all"], [problem, "problem"]] as const) {
		radio.addEventListener("change", () => {
			if (!radio.checked) return;
			if (state.mode === mode && state.response) return;
			state.mode = mode;
			state.response = null;
			rememberView();
			void load();
		});
	}
	updateInput();
	display();
	if (state.open && !state.response) void load();
	return section;
}
