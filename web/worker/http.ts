export class HttpError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
	) {
		super(code);
	}
}

export function json(data: unknown, status = 200, cacheControl = "no-store"): Response {
	return Response.json(data, { status, headers: { "Cache-Control": cacheControl } });
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
	try {
		const body = await request.json();
		if (typeof body === "object" && body !== null && !Array.isArray(body)) return body as Record<string, unknown>;
	} catch {
		// fall through
	}
	throw new HttpError(400, "invalid_body");
}

export function positiveInt(text: string | undefined): number {
	const value = Number(text);
	if (!Number.isSafeInteger(value) || value < 1) throw new HttpError(404, "not_found");
	return value;
}

const ID_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // 32 characters, no look-alikes

export function randomId(length: number): string {
	const bytes = crypto.getRandomValues(new Uint8Array(length));
	return Array.from(bytes, (b) => ID_ALPHABET[b & 31]).join("");
}

export function randomToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256Hex(text: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
	return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Rate-limit key for a client address. An IPv6 subscriber usually owns a whole /64,
 * so IPv6 addresses are grouped by that prefix; IPv4 addresses are used as they are.
 */
export function addressKey(ip: string): string {
	if (!ip.includes(":")) return ip;
	const [head, tail = ""] = ip.toLowerCase().split("::");
	const left = head ? head.split(":") : [];
	const right = tail ? tail.split(":") : [];
	const groups = ip.includes("::") ? [...left, ...Array(8 - left.length - right.length).fill("0"), ...right] : left;
	return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

/** Uniform integer in [1, max]. */
export function randomInt(max: number): number {
	const [value] = crypto.getRandomValues(new Uint32Array(1));
	return 1 + Math.floor((value / 2 ** 32) * max);
}
