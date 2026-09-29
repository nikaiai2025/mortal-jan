import type { Session } from "../shared/types";

const SESSION_KEY = "mortal-jan.session";

export class ApiError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
	) {
		super(code);
	}
}

function storedSession(): Session | null {
	try {
		const raw = localStorage.getItem(SESSION_KEY);
		return raw ? (JSON.parse(raw) as Session) : null;
	} catch {
		return null;
	}
}

function storeSession(session: Session | null): void {
	try {
		if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
		else localStorage.removeItem(SESSION_KEY);
	} catch {
		// Without storage the session lasts until the page is closed.
	}
}

let current: Session | null = storedSession();
let creating: Promise<Session> | null = null;

async function request<T>(path: string, init: RequestInit = {}, session?: Session): Promise<T> {
	const headers = new Headers(init.headers);
	if (session) headers.set("Authorization", `Bearer ${session.token}`);
	if (init.body) headers.set("Content-Type", "application/json");
	const response = await fetch(path, { ...init, headers });
	const body = (await response.json().catch(() => ({}))) as { error?: string };
	if (!response.ok) throw new ApiError(response.status, body.error ?? "network");
	return body as T;
}

/** The anonymous player of this browser, issued on first use. */
export function ensureSession(): Promise<Session> {
	if (current) return Promise.resolve(current);
	creating ??= request<Session>("/api/players", { method: "POST" })
		.then((session) => {
			current = session;
			storeSession(session);
			return session;
		})
		.finally(() => {
			creating = null; // a failed attempt can be retried
		});
	return creating;
}

export const currentPublicId = (): string | null => current?.publicId ?? null;

/** Authenticated request; a lost player (e.g. a reset database) is replaced once. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
	try {
		return await request<T>(path, init, await ensureSession());
	} catch (error) {
		if (!(error instanceof ApiError) || error.status !== 401) throw error;
		current = null;
		storeSession(null);
		return request<T>(path, init, await ensureSession());
	}
}

export const publicApi = <T>(path: string): Promise<T> => request<T>(path);

export const post = <T>(path: string, body: unknown): Promise<T> =>
	api<T>(path, { method: "POST", body: JSON.stringify(body) });

export const put = <T>(path: string, body: unknown): Promise<T> =>
	api<T>(path, { method: "PUT", body: JSON.stringify(body) });
