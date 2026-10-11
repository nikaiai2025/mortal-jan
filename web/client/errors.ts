import { t } from "./i18n";
import { DAILY_ANSWER_LIMIT, NAME_MAX_LENGTH } from "../shared/rules";
import { ApiError } from "./api";

const messages = (): Record<string, string> => ({
	rate_limited: t("操作が多すぎます。少し時間をおいてからもう一度お試しください。", "Too many requests. Please wait a moment and try again."),
	daily_limit: t(`今日の回答数の上限（${DAILY_ANSWER_LIMIT}問）に達しました。明日また挑戦してください。`, `You’ve reached today’s limit of ${DAILY_ANSWER_LIMIT} answers. Come back tomorrow.`),
	not_assigned: t("ほかの画面で別の問題を開いたため、この回答は受け付けられません。ページを再読み込みしてください。", "You opened another problem in a different tab, so this answer couldn’t be accepted. Please reload the page."),
	not_found: t("ページが見つかりません。", "Page not found."),
	answer_required: t("回答後に牌譜を表示できます。", "Answer the problem to view the game replay."),
	log_unavailable: t("この問題の牌譜はまだ用意されていません。", "The game replay for this problem isn’t available yet."),
	name_too_long: t(`${NAME_MAX_LENGTH}文字以内にしてください。`, `Use no more than ${NAME_MAX_LENGTH} characters.`),
	name_ng: t("使えない言葉が含まれています。", "That name contains a word that isn’t allowed."),
	name_invalid: t("使えない文字が含まれています。", "That name contains unsupported characters."),
	unauthorized: t("この端末では成績を利用できません。復活の呪文で復旧してください。", "This device no longer has access to your stats. Restore them with your recovery code."),
	session_invalid: t("保存された利用者情報を読み取れません。復活の呪文で復旧してください。", "Your saved profile couldn’t be read. Restore it with your recovery code."),
	session_unavailable: t("このブラウザーでは利用者情報を保存できません。ブラウザーの設定を確認してください。", "This browser can’t save your profile. Please check your browser settings."),
	session_changed: t("別の画面で利用者情報が変更されました。再読み込みしてください。", "Your profile changed in another tab. Please reload this page."),
	invalid_spell: t("復活の呪文が一致しません。保存した文字列を確認してください。", "That recovery code doesn’t match. Please check your saved code."),
	recovery_exists: t("呪文は発行済みです。変更する場合は再発行してください。", "A recovery code already exists. Create a replacement if you need a new one."),
	backup_required: t("先に今の成績ページで復活の呪文を発行・保存してください。", "First, create and save a recovery code from your current stats page."),
});

export function errorMessage(error: unknown, fallback = t("通信に失敗しました。もう一度お試しください。", "Couldn’t connect. Please try again.")): string {
	return error instanceof ApiError ? (messages()[error.code] ?? fallback) : fallback;
}
