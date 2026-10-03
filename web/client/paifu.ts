import type { Result } from "../shared/types";
import { api } from "./api";
import { h } from "./dom";
import { errorMessage } from "./errors";

/** This control appears only on results. The API separately checks the player's answer. */
export function logViewer(result: Result): HTMLElement {
	const panelId = `problem-log-${result.id}`;
	const button = h("button", { class: "ghost-button", type: "button", "aria-expanded": "false", "aria-controls": panelId }, "牌譜を表示");
	const message = h("p", { class: "log-viewer__message", role: "status", "aria-live": "polite" });
	const text = h("textarea", { class: "log-viewer__text", readOnly: true, spellcheck: false, rows: 6, "aria-label": "牌譜テキスト" });
	const copy = h("button", { class: "ghost-button", type: "button" }, "クリップボードにコピー");
	copy.addEventListener("click", async () => {
		copy.disabled = true;
		message.textContent = "";
		try {
			await navigator.clipboard.writeText(text.value);
			message.textContent = "コピーしました。";
		} catch {
			text.focus();
			text.select();
			message.textContent = "コピーできませんでした。選択された牌譜を手動でコピーしてください。";
		} finally {
			copy.disabled = false;
		}
	});
	const panel = h(
		"section",
		{ class: "log-viewer__panel", id: panelId, hidden: true, "aria-label": "牌譜" },
		text,
		h("div", { class: "log-viewer__actions" }, copy, h("a", { href: "https://mjai.ekyu.moe/", target: "_blank", rel: "noopener noreferrer" }, "Mortal公式")),
		h("p", { class: "log-viewer__help" }, "カスタム牌譜に貼り付けてください。対象プレイヤーは", h("strong", {}, result.scene.seat), "です。"),
		h("p", { class: "log-viewer__help" }, "評価の％も比べる場合は、温度を1.0に設定してください。"),
	);
	const show = (visible: boolean) => {
		panel.hidden = !visible;
		button.setAttribute("aria-expanded", String(visible));
		button.textContent = visible ? "牌譜を閉じる" : "牌譜を表示";
	};
	button.addEventListener("click", async () => {
		message.textContent = "";
		if (!panel.hidden) return show(false);
		if (text.value) return show(true);
		button.disabled = true;
		try {
			const log = await api<Record<string, unknown>>(`/api/problems/${result.id}/log`);
			text.value = JSON.stringify(log);
			show(true);
		} catch (error) {
			message.textContent = errorMessage(error);
		} finally {
			button.disabled = false;
		}
	});
	return h("div", { class: "log-viewer" }, button, panel, message);
}
