import { DAY_MS, VISITOR_ID_PATTERN, normalizeAcquisition } from "../shared/acquisition";
import { jstDate } from "../shared/rules";
import { sha256Hex } from "./http";

interface FirstAnswer { answered_at: string; jst_date: string }
interface Visitor { player_id: number | null; first_seen_ms: number; eligible: number; first_answer_ms: number | null }

const firstAnswer = (db: D1Database, playerId: number) => db.prepare(
	"SELECT answered_at, jst_date FROM answers WHERE player_id = ? ORDER BY answered_at, id LIMIT 1",
).bind(playerId).first<FirstAnswer>();

async function bindPlayer(db: D1Database, hash: string, playerId: number): Promise<void> {
	const visitor = await db.prepare("SELECT player_id, first_seen_ms, eligible, first_answer_ms FROM acquisition_visitors WHERE visitor_hash = ?").bind(hash).first<Visitor>();
	if (!visitor || (visitor.player_id !== null && visitor.player_id !== playerId)) return;
	if (visitor.player_id === playerId) return;
	const previous = await db.prepare("SELECT visitor_hash FROM acquisition_visitors WHERE player_id = ?").bind(playerId).first<string>("visitor_hash");
	if (previous && previous !== hash) {
		await db.prepare("UPDATE acquisition_visitors SET eligible = 0 WHERE visitor_hash = ? AND player_id IS NULL AND first_answer_ms IS NULL").bind(hash).run();
		return;
	}
	const first = await firstAnswer(db, playerId);
	const existing = first !== null && Date.parse(first.answered_at) < visitor.first_seen_ms;
	try {
		await db.prepare("UPDATE acquisition_visitors SET player_id = ?, eligible = CASE WHEN first_answer_ms IS NULL AND ? THEN 0 ELSE eligible END WHERE visitor_hash = ? AND (player_id IS NULL OR player_id = ?)")
			.bind(playerId, existing ? 1 : 0, hash, playerId).run();
	} catch (error) {
		// Two tabs with different visitor IDs can race to bind the same player. Never count both.
		if (!String(error).includes("UNIQUE")) throw error;
		await db.prepare("UPDATE acquisition_visitors SET eligible = 0 WHERE visitor_hash = ? AND player_id IS NULL AND first_answer_ms IS NULL").bind(hash).run();
	}
}

export async function collectArrival(db: D1Database, body: Record<string, unknown>, playerId: number | null, now = new Date()): Promise<void> {
	if (typeof body.visitorId !== "string" || !VISITOR_ID_PATTERN.test(body.visitorId)) throw new Error("invalid_visitor");
	const hash = await sha256Hex(body.visitorId.toLowerCase());
	const a = normalizeAcquisition(body);
	await db.prepare("INSERT OR IGNORE INTO acquisition_visitors (visitor_hash, first_seen_ms, first_seen_day, source, medium, campaign, content, landing, eligible) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
		.bind(hash, now.getTime(), jstDate(now), a.source, a.medium, a.campaign, a.content, a.landing, a.campaign === "internal-check" ? 0 : 1).run();
	if (playerId !== null) await bindPlayer(db, hash, playerId);
}

/** Called after saving an answer. Replayed HTTP submissions use the original saved timestamp. */
export async function collectAnswer(db: D1Database, playerId: number, problemId: number, visitorId: string): Promise<void> {
	if (!VISITOR_ID_PATTERN.test(visitorId)) return;
	const hash = await sha256Hex(visitorId.toLowerCase());
	await bindPlayer(db, hash, playerId);
	const first = await firstAnswer(db, playerId);
	if (!first) return;
	await db.prepare("UPDATE acquisition_visitors SET first_answer_ms = ?, first_answer_day = ? WHERE visitor_hash = ? AND player_id = ? AND eligible = 1 AND first_answer_ms IS NULL AND first_seen_ms <= ?")
		.bind(Date.parse(first.answered_at), first.jst_date, hash, playerId, Date.parse(first.answered_at)).run();
	const answer = await db.prepare("SELECT answered_at, jst_date FROM answers WHERE player_id = ? AND problem_id = ?").bind(playerId, problemId).first<FirstAnswer>();
	if (!answer) return;
	const days = Math.round((Date.parse(`${answer.jst_date}T00:00:00+09:00`) - Date.parse(`${first.jst_date}T00:00:00+09:00`)) / DAY_MS);
	if (days >= 1 && days <= 7) {
		await db.prepare("UPDATE acquisition_visitors SET returned_day = ? WHERE visitor_hash = ? AND player_id = ? AND eligible = 1 AND first_answer_ms IS NOT NULL AND returned_day IS NULL")
			.bind(answer.jst_date, hash, playerId).run();
	}
}
