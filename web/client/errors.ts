import { DAILY_ANSWER_LIMIT, NAME_MAX_LENGTH } from "../shared/rules";
import { ApiError } from "./api";

const MESSAGES: Record<string, string> = {
	rate_limited: "操作が多すぎます。少し時間をおいてからもう一度お試しください。",
	daily_limit: `今日の回答数の上限（${DAILY_ANSWER_LIMIT}問）に達しました。明日また挑戦してください。`,
	not_assigned: "別の問題が解答中です。ページを再読み込みしてください。",
	not_found: "ページが見つかりません。",
	name_too_long: `${NAME_MAX_LENGTH}文字以内にしてください。`,
	name_ng: "使えない言葉が含まれています。",
	name_invalid: "使えない文字が含まれています。",
};

export function errorMessage(error: unknown, fallback = "通信に失敗しました。もう一度お試しください。"): string {
	return error instanceof ApiError ? (MESSAGES[error.code] ?? fallback) : fallback;
}
