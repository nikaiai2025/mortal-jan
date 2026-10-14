// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from "vitest";
import type { Comment, CommentsResponse } from "../shared/types";
import { comments, commentDraft } from "./comments";
import { ApiError, post, publicApi } from "./api";
import { setLocale } from "./i18n";

vi.mock("./api", async (original) => ({ ...await original<typeof import("./api")>(), post: vi.fn(), publicApi: vi.fn() }));
const comment: Comment = { id: 10, problemId: 42, player: { name: "投稿者", publicId: "author" }, body: "一行目\n二行目", createdAt: "2026-10-14T00:00:00Z" };
const response = (items: Comment[] = [comment]): CommentsResponse => ({ comments: items });
beforeEach(() => {
	vi.clearAllMocks();
	vi.stubGlobal("matchMedia", () => ({ matches: false }));
	setLocale("ja");
	document.body.replaceChildren();
	vi.mocked(publicApi).mockResolvedValue(response());
	vi.mocked(post).mockResolvedValue(comment);
});
const mount = () => {
	const root = document.createElement("div");
	root.append(comments(42));
	document.body.append(root);
	return root;
};
const button = (root: HTMLElement, label: string) => Array.from(root.querySelectorAll("button")).find(item => item.textContent === label)!;
const mode = (root: HTMLElement, label: string) => Array.from(root.querySelectorAll(".comments__modes label")).find(item => item.textContent === label)!.querySelector<HTMLInputElement>("input")!;
const type = (root: HTMLElement, body: string) => {
	root.querySelector("textarea")!.value = body;
	root.querySelector("textarea")!.dispatchEvent(new Event("input"));
};
const settled = () => vi.waitFor(() => expect(document.querySelector(".comments__message")?.textContent).not.toBe("投稿中…"));

it("loads lazily and switches between all and the displayed problem", async () => {
	const root = mount();
	expect(publicApi).not.toHaveBeenCalled();
	expect(root.querySelector<HTMLElement>(".comments__content")!.hidden).toBe(true);
	expect(button(root, "投稿").disabled).toBe(true);
	button(root, "コメント").click();
	expect(root.querySelector<HTMLElement>(".comments__content")!.hidden).toBe(false);
	await vi.waitFor(() => expect(root.querySelectorAll(".comments__entry")).toHaveLength(1));
	expect(publicApi).toHaveBeenLastCalledWith("/api/comments?problem=42");
	expect(root.textContent).not.toContain("以前のコメント");
	mode(root, "全表示").click();
	await vi.waitFor(() => expect(mode(root, "全表示").checked).toBe(true));
	expect(mode(root, "対象問題のみ（第42問）").checked).toBe(false);
	expect(publicApi).toHaveBeenLastCalledWith("/api/comments");
	button(root, "コメント").click();
	expect(root.querySelector<HTMLElement>(".comments__content")!.hidden).toBe(true);
});
it("keeps failed drafts and blocks duplicate submissions while pending", async () => {
	const root = mount();
	type(root, "コメント本文");
	let reject!: (error: unknown) => void;
	vi.mocked(post).mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }));
	button(root, "投稿").click();
	button(root, "投稿").click();
	expect(post).toHaveBeenCalledTimes(1);
	expect(post).toHaveBeenCalledWith("/api/problems/42/comments", { body: "コメント本文" });
	reject(new ApiError(429, "rate_limited"));
	await settled();
	expect(root.querySelector("textarea")!.value).toBe("コメント本文");
	expect(root.textContent).toContain("操作が多すぎます");
	expect(button(root, "投稿").disabled).toBe(false);
});
it("clears a successful draft and refreshes the open board", async () => {
	const root = mount();
	button(root, "コメント").click();
	await vi.waitFor(() => expect(root.querySelectorAll(".comments__entry")).toHaveLength(1));
	type(root, "投稿本文");
	button(root, "投稿").click();
	await settled();
	expect(root.querySelector("textarea")!.value).toBe("");
	expect(root.querySelector(".comments__form > .comments__message")!.textContent).toBe("");
	expect(publicApi).toHaveBeenCalledTimes(2);
});
it("renders untrusted text safely and retains loaded posts and drafts across a language switch", async () => {
	vi.mocked(publicApi).mockResolvedValueOnce(response([{ ...comment, body: '<img src=x onerror="alert(1)">' }, { ...comment, id: 9, player: { name: null, publicId: "anon" } }]));
	const root = mount();
	button(root, "コメント").click();
	await vi.waitFor(() => expect(root.querySelectorAll(".comments__entry")).toHaveLength(2));
	expect(publicApi).toHaveBeenLastCalledWith("/api/comments?problem=42");
	expect(root.querySelector("img")).toBeNull();
	type(root, "未投稿の下書き");
	setLocale("en");
	root.replaceChildren(comments(42, commentDraft(root)));
	expect(root.querySelector("textarea")!.value).toBe("未投稿の下書き");
	expect(root.textContent).toContain("Anonymous#anon");
	expect(root.querySelectorAll(".comments__entry")).toHaveLength(2);
	expect(publicApi).toHaveBeenCalledTimes(1);
	expect(root.textContent).not.toContain("Read older comments");
});
it("ignores a slow response from the previous mode", async () => {
	let resolve!: (response: CommentsResponse) => void;
	vi.mocked(publicApi).mockImplementationOnce(() => new Promise(done => { resolve = done; })).mockResolvedValueOnce(response([{ ...comment, problemId: 99 }]));
	const root = mount();
	button(root, "コメント").click();
	mode(root, "全表示").click();
	await vi.waitFor(() => expect(root.textContent).toContain("第99問"));
	resolve(response());
	await Promise.resolve();
	expect(root.querySelectorAll(".comments__entry")).toHaveLength(1);
	expect(root.textContent).toContain("第99問");
});
it("counts Unicode characters and disables blank or excessive posts", () => {
	const root = mount();
	type(root, " \n");
	expect(button(root, "投稿").disabled).toBe(true);
	type(root, "😀".repeat(1000));
	expect(root.textContent).toContain("1000/1000");
	expect(button(root, "投稿").disabled).toBe(false);
	type(root, "あ".repeat(1001));
	expect(button(root, "投稿").disabled).toBe(true);
});

it("keeps the PC board open for a new problem without carrying its draft or cached posts", async () => {
	vi.stubGlobal("matchMedia", () => ({ matches: true }));
	const root = mount();
	button(root, "コメント").click();
	await vi.waitFor(() => expect(root.querySelectorAll(".comments__entry")).toHaveLength(1));
	type(root, "第42問だけの下書き");
	root.replaceChildren(comments(43));
	expect(root.querySelector<HTMLElement>(".comments__content")!.hidden).toBe(false);
	expect(root.querySelector("textarea")!.value).toBe("");
	expect(root.querySelectorAll(".comments__entry")).toHaveLength(0);
	expect(publicApi).toHaveBeenLastCalledWith("/api/comments?problem=43");
	await vi.waitFor(() => expect(root.querySelectorAll(".comments__entry")).toHaveLength(1));
	mode(root, "全表示").click();
	await vi.waitFor(() => expect(publicApi).toHaveBeenLastCalledWith("/api/comments"));
	root.replaceChildren(comments(44));
	expect(mode(root, "全表示").checked).toBe(true);
	expect(publicApi).toHaveBeenLastCalledWith("/api/comments");
	// A phone starts closed even when the PC view was open.
	vi.stubGlobal("matchMedia", () => ({ matches: false }));
	root.replaceChildren(comments(45));
	expect(root.querySelector<HTMLElement>(".comments__content")!.hidden).toBe(true);
	vi.stubGlobal("matchMedia", () => ({ matches: true }));
	root.replaceChildren(comments(46));
	button(root, "コメント").click();
	root.replaceChildren(comments(47));
	expect(root.querySelector<HTMLElement>(".comments__content")!.hidden).toBe(true);
});
