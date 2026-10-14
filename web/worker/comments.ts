import { COMMENT_MAX_LENGTH, COMMENT_LIST_LIMIT } from "../shared/comments";
import type { Comment, CommentsResponse, PlayerLabel } from "../shared/types";
import { HttpError } from "./http";

interface CommentRow {
	id: number;
	problem_id: number;
	player_public_id: string;
	player_name: string | null;
	body: string;
	created_at: string;
}

const columns = "id, problem_id, player_public_id, player_name, body, created_at";
const toComment = (row: CommentRow): Comment => ({
	id: row.id,
	problemId: row.problem_id,
	player: { publicId: row.player_public_id, name: row.player_name },
	body: row.body,
	createdAt: row.created_at,
});

export function validateComment(value: unknown): string {
	if (typeof value !== "string") throw new HttpError(400, "invalid_comment");
	const body = value.replace(/\r\n?/g, "\n").trim();
	if (!body || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(body)) throw new HttpError(400, "invalid_comment");
	if ([...body].length > COMMENT_MAX_LENGTH) throw new HttpError(400, "comment_too_long");
	return body;
}

export async function insertComment(db: D1Database, problemId: number, player: PlayerLabel & { id: number }, body: string): Promise<Comment> {
	const problem = await db.prepare("SELECT 1 FROM problems WHERE id = ?").bind(problemId).first();
	if (!problem) throw new HttpError(404, "not_found");
	const row = await db.prepare(`INSERT INTO comments (problem_id, player_id, player_public_id, player_name, body) VALUES (?, ?, ?, ?, ?) RETURNING ${columns}`)
		.bind(problemId, player.id, player.publicId, player.name, body).first<CommentRow>();
	if (!row) throw new Error("Comment insert returned no row");
	return toComment(row);
}

/** Only the latest posts in the chosen scope are readable; there is no history cursor. */
export async function listComments(db: D1Database, problemId: number | null): Promise<CommentsResponse> {
	const statement = problemId === null
		? db.prepare(`SELECT ${columns} FROM comments ORDER BY id DESC LIMIT ?`).bind(COMMENT_LIST_LIMIT)
		: db.prepare(`SELECT ${columns} FROM comments WHERE problem_id = ? ORDER BY id DESC LIMIT ?`).bind(problemId, COMMENT_LIST_LIMIT);
	const { results } = await statement.all<CommentRow>();
	return { comments: results.map(toComment) };
}
