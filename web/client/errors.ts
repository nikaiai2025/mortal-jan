import { DAILY_ANSWER_LIMIT, NAME_MAX_LENGTH } from "../shared/rules";
import { ApiError } from "./api";

const MESSAGES: Record<string, string> = {
	rate_limited: "操作が多すぎます。少し時間をおいてからもう一度お試しください。",
	daily_limit: `今日の回答数の上限（${DAILY_ANSWER_LIMIT}問）に達しました。明日また挑戦してください。`,
	not_assigned: "ほかの画面で別の問題を開いたため、この回答は受け付けられません。ページを再読み込みしてください。",
	not_found: "ページが見つかりません。",
	answer_required: "回答後に牌譜を表示できます。",
	log_unavailable: "この問題の牌譜はまだ用意されていません。",
	name_too_long: `${NAME_MAX_LENGTH}文字以内にしてください。`,
	name_ng: "使えない言葉が含まれています。",
	name_invalid: "使えない文字が含まれています。",
	unauthorized: "この端末では成績を利用できません。復活の呪文で復旧してください。",
	session_invalid: "保存された利用者情報を読み取れません。復活の呪文で復旧してください。",
	session_unavailable: "このブラウザーでは利用者情報を保存できません。ブラウザーの設定を確認してください。",
	session_changed: "別の画面で利用者情報が変更されました。再読み込みしてください。",
	invalid_spell: "復活の呪文が一致しません。保存した文字列を確認してください。",
	recovery_exists: "呪文は発行済みです。変更する場合は再発行してください。",
	backup_required: "先に今の成績ページで復活の呪文を発行・保存してください。",
};

export function errorMessage(error: unknown, fallback = "通信に失敗しました。もう一度お試しください。"): string {
	return error instanceof ApiError ? (MESSAGES[error.code] ?? fallback) : fallback;
}
