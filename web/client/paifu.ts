import { t } from "./i18n";
import type { Result } from "../shared/types";
import { api } from "./api";
import { h } from "./dom";
import { errorMessage } from "./errors";

/** This control appears only on results. The API separately checks the player's answer. */
export function logViewer(result: Result): HTMLElement {
	const panelId = `problem-log-${result.id}`;
	const button = h("button", { class: "ghost-button", type: "button", "aria-expanded": "false", "aria-controls": panelId }, t("牌譜を表示", "Show game log"));
	const message = h("p", { class: "log-viewer__message", role: "status", "aria-live": "polite" });
	const text = h("textarea", { class: "log-viewer__text", readOnly: true, spellcheck: false, rows: 6, "aria-label": t("牌譜テキスト", "Game log text") });
	const copy = h("button", { class: "ghost-button", type: "button" }, t("クリップボードにコピー", "Copy to clipboard"));
	copy.addEventListener("click", async () => {
		copy.disabled = true;
		message.textContent = "";
		try {
			await navigator.clipboard.writeText(text.value);
			message.textContent = t("コピーしました。", "Copied.");
		} catch {
			text.focus();
			text.select();
			message.textContent = t("コピーできませんでした。選択された牌譜を手動でコピーしてください。", "Copy failed. Please copy the selected game log manually.");
		} finally {
			copy.disabled = false;
		}
	});
	const panel = h(
		"section",
		{ class: "log-viewer__panel", id: panelId, hidden: true, "aria-label": t("牌譜", "Game log") },
		text,
		h("div", { class: "log-viewer__actions" }, copy, h("a", { href: "https://mjai.ekyu.moe/", target: "_blank", rel: "noopener noreferrer" }, t("Mortal公式", "Official Mortal reviewer"))),
		h("p", { class: "log-viewer__help" }, t("カスタム牌譜に貼り付けてください。対象プレイヤーは", "Paste this into Custom game log. Select player "), h("strong", {}, result.scene.seat), t("です。", ".")),
		h("p", { class: "log-viewer__help" }, t("評価の％も比べる場合は、温度を1.0に設定してください。", "To compare the evaluation percentages, set the temperature to 1.0.")),
	);
	const show = (visible: boolean) => {
		panel.hidden = !visible;
		button.setAttribute("aria-expanded", String(visible));
		button.textContent = visible ? t("牌譜を閉じる", "Hide game log") : t("牌譜を表示", "Show game log");
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
