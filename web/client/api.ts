import type { Session } from "../shared/types";

export const SESSION_KEY = "mortal-jan.session";

export class ApiError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
	) {
		super(code);
	}
}

function storedSession(): Session | null {
	let raw: string | null;
	try {
		raw = localStorage.getItem(SESSION_KEY);
	} catch {
		throw new ApiError(401, "session_unavailable");
	}
	if (raw === null) return null;
	try {
		const value = JSON.parse(raw) as Partial<Session> | null;
		if (value && typeof value.token === "string" && value.token && typeof value.publicId === "string" && /^[a-z0-9]+$/.test(value.publicId)) {
			return { token: value.token, publicId: value.publicId };
		}
	} catch {
		// Keep the original value until the user chooses recovery or a new start.
	}
	throw new ApiError(401, "session_invalid");
}

function signal(name: string): void {
	if (typeof window !== "undefined") window.dispatchEvent(new Event(name));
}

function adopt(session: Session): Session {
	current = session;
	storageError = null;
	try {
		localStorage.setItem(SESSION_KEY, JSON.stringify(session));
		persistent = true;
	} catch {
		persistent = false;
		signal("session-storage-failed");
	}
	return session;
}

let current: Session | null = null;
let storageError: ApiError | null = null;
let persistent = true;
try {
	current = storedSession();
} catch (error) {
	storageError = error as ApiError;
	persistent = false;
}
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
	if (storageError) return Promise.reject(storageError);
	// Serialize first use across tabs where Web Locks are supported.
	const create = async () => {
		const existing = current ?? storedSession();
		if (existing) return adopt(existing);
		const session = await request<Session>("/api/players", { method: "POST" });
		return adopt(current ?? storedSession() ?? session);
	};
	creating ??= (typeof navigator !== "undefined" && navigator.locks
		? navigator.locks.request(SESSION_KEY, create)
		: create()).finally(() => { creating = null; });
	return creating;
}

export const currentPublicId = (): string | null => current?.publicId ?? null;
export const sessionIsPersistent = (): boolean => persistent;

/** A storage event means another tab explicitly changed this browser's player. */
export function syncSessionFromStorage(): void {
	try {
		current = storedSession();
		storageError = null;
		persistent = true;
	} catch (error) {
		storageError = error as ApiError;
		persistent = false;
	}
}

function unchanged(session: Session | null): void {
	if (current?.token !== session?.token) throw new ApiError(409, "session_changed");
}

/** A 401 never discards the player or retries as someone else. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
	const session = await ensureSession();
	try {
		const result = await request<T>(path, init, session);
		unchanged(session);
		return result;
	} catch (error) {
		unchanged(session);
		if (error instanceof ApiError && error.status === 401) signal("session-unauthorized");
		throw error;
	}
}

export async function issueRecovery(replace: boolean): Promise<string> {
	const result = await post<{ spell: string }>("/api/me/recovery", { replace });
	return result.spell;
}

/** Recovery works without creating an empty player first. Failed attempts change nothing. */
export async function recoverSession(spell: string, confirmSwitch = false): Promise<Session> {
	const previous = current;
	const session = await request<Session>("/api/recover", { method: "POST", body: JSON.stringify({ spell, confirmSwitch }) }, previous ?? undefined);
	unchanged(previous);
	return adopt(session);
}

/** Only an explicit user action may replace an inaccessible player. */
export async function startNewPlayer(): Promise<Session> {
	const previous = current;
	const session = await request<Session>("/api/players", { method: "POST" });
	unchanged(previous);
	return adopt(session);
}

export const publicApi = <T>(path: string): Promise<T> => request<T>(path);

export const post = <T>(path: string, body: unknown): Promise<T> =>
	api<T>(path, { method: "POST", body: JSON.stringify(body) });

export const put = <T>(path: string, body: unknown): Promise<T> =>
	api<T>(path, { method: "PUT", body: JSON.stringify(body) });
