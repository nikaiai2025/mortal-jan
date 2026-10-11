import { t } from "./i18n";
import { ApiError, issueRecovery, recoverSession } from "./api";
import { h, replace } from "./dom";
import { errorMessage } from "./errors";
import type { App } from "./screens";

export function spellTextFile(spell: string, now = new Date()): { filename: string; content: string } {
	const stamp = new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "_");
	return { filename: t(`もーたる何切る復活の呪文_${stamp}.txt`, `mortal-nanikiru-recovery-code_${stamp}.txt`), content: `${spell}\r\n` };
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

export function recoveryPanel(enabled: boolean, visibleSpell?: string): HTMLElement {
	const message = h("p", { class: "form-message", role: "status" });
	const issued = h("div", { class: "recovery-issued" });
	const description = h("p", { class: "note" }, enabled
		? t("呪文は発行済みです。保存した呪文で成績を復旧できます。", "You already have a recovery code. Use your saved code to restore your stats.")
		: t("端末を変えたときやブラウザーのデータを消したときに、成績を復旧できます。", "A recovery code lets you restore your stats after switching devices or clearing browser data."));
	const button = h("button", { class: "ghost-button", type: "button" }, enabled ? t("呪文を再発行", "Replace recovery code") : t("呪文を発行", "Create recovery code"));

	const showSpell = (spell: string) => {
		const field = h("textarea", { class: "spell-field", readOnly: true, rows: 2, value: spell, "aria-label": t("復活の呪文", "Recovery code") });
		field.addEventListener("focus", () => field.select());
		const copy = async () => {
			try {
				await navigator.clipboard.writeText(spell);
				message.textContent = t("コピーしました。", "Copied.");
			} catch {
				field.focus();
				field.select();
				message.textContent = t("選択した呪文をコピーしてください。", "Please copy the selected recovery code.");
			}
	};
	replace(issued,
		field,
		h("p", { class: "note" }, t("この呪文は再表示できません。テキストを保存し、他の人には教えないでください。", "This code won’t be shown again. Save it somewhere safe and don’t share it with anyone.")),
		h("div", { class: "recovery-actions" },
			h("button", { class: "ghost-button", type: "button", onclick: copy }, t("コピー", "Copy")),
			h("button", { class: "ghost-button", type: "button", onclick: () => downloadSpell(spell) }, t("テキストを保存", "Save as text")),
		),
	);
	};
	button.addEventListener("click", async () => {
		if (enabled && !window.confirm(t("前の呪文は使えなくなります。再発行しますか？", "Your previous recovery code will stop working. Create a new one?"))) return;
		button.disabled = true;
		message.textContent = "";
		// A lost reissue response can leave the previous displayed spell invalid.
		issued.replaceChildren();
		try {
			const spell = await issueRecovery(enabled);
			enabled = true;
			button.textContent = t("呪文を再発行", "Replace recovery code");
			description.textContent = t("呪文を保存すると、別の端末でも同じ成績に戻れます。", "Save this code to restore your stats on another device.");
			showSpell(spell);
		} catch (error) {
			if (error instanceof ApiError && error.code === "recovery_exists") {
				enabled = true;
				button.textContent = t("呪文を再発行", "Replace recovery code");
				description.textContent = t("呪文は発行済みです。手元に保存していない場合は再発行してください。", "A recovery code already exists. If you haven’t saved it, create a replacement.");
			}
			message.textContent = errorMessage(error, t("呪文を発行できませんでした。", "Couldn’t create a recovery code."));
		} finally {
			button.disabled = false;
		}
	});
	if (visibleSpell) showSpell(visibleSpell);
	return h("section", { class: "recovery-panel", "aria-labelledby": "recovery-title" },
		h("h2", { id: "recovery-title", class: "section-title" }, t("復活の呪文", "Recovery code")),
		description, issued,
		h("div", { class: "recovery-actions" }, button, h("a", { href: "/recover" }, t("保存した呪文で復旧する", "Restore with a saved code"))),
		h("p", { class: "note" }, t("復旧すると、ほかの端末ではこの成績を利用できなくなります。", "Restoring your stats signs other devices out of this profile.")),
		message,
	);
}

export async function recoveryPage(root: HTMLElement, app: App): Promise<void> {
	const input = h("textarea", { class: "spell-field", name: "spell", rows: 3, required: true, autoCapitalize: "none", spellcheck: false, autocomplete: "off" });
	const message = h("p", { class: "form-message", role: "status" });
	const backup = h("a", { href: "/u/me", hidden: true }, t("今の成績で呪文を保存する", "Save a code for your current stats"));
	const button = h("button", { class: "stamp-button", type: "submit" }, t("復旧する", "Restore stats"));
	const form = h("form", { class: "recovery-form" },
		h("label", {}, t("復活の呪文", "Recovery code"), input), button, message, backup,
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
				if (!window.confirm(t("今の成績から、呪文に保存された成績へ切り替えます。成績は合算されません。復旧しますか？", "This will switch from your current stats to the profile linked to this code. The two profiles won’t be combined. Restore these stats?"))) return;
				session = await recoverSession(input.value, true);
			}
			app.navigate(`/u/${session.publicId}`);
		} catch (error) {
			message.textContent = errorMessage(error, t("復旧できませんでした。", "Couldn’t restore your stats."));
			backup.hidden = error instanceof ApiError && error.code === "backup_required" ? false : true;
		} finally {
			button.disabled = false;
		}
	});
	replace(root,
		h("header", { class: "page-head" }, h("h1", {}, t("成績を復旧", "Restore your stats"))),
		h("p", { class: "note" }, t("保存したテキストから呪文を貼り付けてください。名前が変わっていても復旧できます。", "Paste your saved recovery code. It still works if the profile name has changed.")),
		form,
		h("p", { class: "note" }, t("復旧後は、ほかの端末でこの成績を利用できなくなります。呪文がなく、元の端末も使えない場合は復旧できません。", "Restoring signs other devices out of this profile. Without a recovery code or access to the original device, your stats can’t be restored.")),
	);
}
