import { ApiError, issueRecovery, recoverSession } from "./api";
import { h, replace } from "./dom";
import { errorMessage } from "./errors";
import type { App } from "./screens";

export function spellTextFile(spell: string, now = new Date()): { filename: string; content: string } {
	const stamp = new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "_");
	return { filename: `もーたる何切る復活の呪文_${stamp}.txt`, content: `${spell}\r\n` };
}

function downloadSpell(spell: string): void {
	const file = spellTextFile(spell);
	const url = URL.createObjectURL(new Blob([file.content], { type: "text/plain;charset=utf-8" }));
	const link = h("a", { href: url, download: file.filename });
	document.body.append(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function recoveryPanel(enabled: boolean): HTMLElement {
	const message = h("p", { class: "form-message", role: "status" });
	const issued = h("div");
	const description = h("p", { class: "note" }, enabled
		? "呪文は発行済みです。保存した呪文で成績を復旧できます。"
		: "端末を変えたときやブラウザーのデータを消したときに、成績を復旧できます。");
	const button = h("button", { class: "ghost-button", type: "button" }, enabled ? "呪文を再発行" : "呪文を発行");
	button.addEventListener("click", async () => {
		if (enabled && !window.confirm("前の呪文は使えなくなります。再発行しますか？")) return;
		button.disabled = true;
		message.textContent = "";
		// A lost reissue response can leave the previous displayed spell invalid.
		issued.replaceChildren();
		try {
			const spell = await issueRecovery(enabled);
			enabled = true;
			button.textContent = "呪文を再発行";
			description.textContent = "呪文を保存すると、別の端末でも同じ成績に戻れます。";
			const field = h("textarea", { class: "spell-field", readOnly: true, rows: 2, value: spell, "aria-label": "復活の呪文" });
			field.addEventListener("focus", () => field.select());
			const copy = async () => {
				try {
					await navigator.clipboard.writeText(spell);
					message.textContent = "コピーしました。";
				} catch {
					field.focus();
					field.select();
					message.textContent = "選択した呪文をコピーしてください。";
				}
			};
			replace(issued,
				field,
				h("p", { class: "note" }, "この呪文は再表示できません。テキストを保存し、他の人には教えないでください。"),
				h("div", { class: "recovery-actions" },
					h("button", { class: "ghost-button", type: "button", onclick: copy }, "コピー"),
					h("button", { class: "ghost-button", type: "button", onclick: () => downloadSpell(spell) }, "テキストを保存"),
				),
			);
		} catch (error) {
			if (error instanceof ApiError && error.code === "recovery_exists") {
				enabled = true;
				button.textContent = "呪文を再発行";
				description.textContent = "呪文は発行済みです。手元に保存していない場合は再発行してください。";
			}
			message.textContent = errorMessage(error, "呪文を発行できませんでした。");
		} finally {
			button.disabled = false;
		}
	});
	return h("section", { class: "recovery-panel", "aria-labelledby": "recovery-title" },
		h("h2", { id: "recovery-title", class: "section-title" }, "復活の呪文"),
		description, issued,
		h("div", { class: "recovery-actions" }, button, h("a", { href: "/recover" }, "保存した呪文で復旧する")),
		h("p", { class: "note" }, "復旧すると、ほかの端末ではこの成績を利用できなくなります。"),
		message,
	);
}

export async function recoveryPage(root: HTMLElement, app: App): Promise<void> {
	const input = h("textarea", { class: "spell-field", name: "spell", rows: 3, required: true, autoCapitalize: "none", spellcheck: false, autocomplete: "off" });
	const message = h("p", { class: "form-message", role: "status" });
	const backup = h("a", { href: "/u/me", hidden: true }, "今の成績で呪文を保存する");
	const button = h("button", { class: "stamp-button", type: "submit" }, "復旧する");
	const form = h("form", { class: "recovery-form" },
		h("label", {}, "復活の呪文", input), button, message, backup,
	);
	form.addEventListener("submit", async (event) => {
		event.preventDefault();
		button.disabled = true;
		message.textContent = "";
		backup.hidden = true;
		try {
			let session;
			try {
				session = await recoverSession(input.value);
			} catch (error) {
				if (!(error instanceof ApiError) || error.code !== "switch_required") throw error;
				if (!window.confirm("今の成績から、呪文に保存された成績へ切り替えます。成績は合算されません。復旧しますか？")) return;
				session = await recoverSession(input.value, true);
			}
			app.navigate(`/u/${session.publicId}`);
		} catch (error) {
			message.textContent = errorMessage(error, "復旧できませんでした。");
			backup.hidden = error instanceof ApiError && error.code === "backup_required" ? false : true;
		} finally {
			button.disabled = false;
		}
	});
	replace(root,
		h("header", { class: "page-head" }, h("h1", {}, "成績を復旧")),
		h("p", { class: "note" }, "保存したテキストから呪文を貼り付けてください。名前が変わっていても復旧できます。"),
		form,
		h("p", { class: "note" }, "復旧後は、ほかの端末でこの成績を利用できなくなります。呪文がなく、元の端末も使えない場合は復旧できません。"),
	);
}
