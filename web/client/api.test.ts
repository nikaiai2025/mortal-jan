import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const key = "mortal-jan.session";
const old = { token: "old-token", publicId: "oldplayer" };
const restored = { token: "new-token", publicId: "oldplayer" };
let values: Map<string, string>;
let fetchMock: ReturnType<typeof vi.fn>;
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
	vi.resetModules();
	values = new Map();
	vi.stubGlobal("localStorage", {
		getItem: (name: string) => values.get(name) ?? null,
		setItem: (name: string, value: string) => values.set(name, value),
	});
	vi.stubGlobal("navigator", {});
	vi.stubGlobal("window", new EventTarget());
	fetchMock = vi.fn();
	vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("identity preservation", () => {
	it("keeps the same player and storage on 401 without an automatic retry", async () => {
		values.set(key, JSON.stringify(old));
		fetchMock.mockResolvedValue(response({ error: "unauthorized" }, 401));
		const client = await import("./api");
		const notice = vi.fn();
		window.addEventListener("session-unauthorized", notice);
		await expect(client.api("/api/me")).rejects.toMatchObject({ status: 401 });
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(values.get(key)).toBe(JSON.stringify(old));
		expect(client.currentPublicId()).toBe(old.publicId);
		expect(notice).toHaveBeenCalledTimes(1);
	});
	it("leaves the current session intact after failed recovery", async () => {
		values.set(key, JSON.stringify(old));
		fetchMock.mockResolvedValue(response({ error: "invalid_spell" }, 400));
		const client = await import("./api");
		await expect(client.recoverSession("wrong")).rejects.toMatchObject({ code: "invalid_spell" });
		expect(values.get(key)).toBe(JSON.stringify(old));
		expect(client.currentPublicId()).toBe(old.publicId);
	});
	it("recovers on a new browser without first creating an empty player or storing the spell", async () => {
		fetchMock.mockResolvedValue(response(restored));
		const client = await import("./api");
		expect(await client.recoverSession("private-spell")).toEqual(restored);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0][0]).toBe("/api/recover");
		expect([...values.values()]).toEqual([JSON.stringify(restored)]);
	});
	it("keeps the current session when issuing a spell, keeping the spell out of storage", async () => {
		values.set(key, JSON.stringify(old));
		fetchMock.mockResolvedValue(response({ spell: "private-spell" }));
		const client = await import("./api");
		expect(await client.issueRecovery(false)).toBe("private-spell");
		expect(values.get(key)).toBe(JSON.stringify(old));
	});
	it("keeps unreadable storage until an explicit new start succeeds", async () => {
		values.set(key, "broken-json");
		const client = await import("./api");
		await expect(client.ensureSession()).rejects.toMatchObject({ code: "session_invalid" });
		expect(fetchMock).not.toHaveBeenCalled();
		expect(values.get(key)).toBe("broken-json");
		fetchMock.mockResolvedValue(response(restored, 201));
		await client.startNewPlayer();
		expect(values.get(key)).toBe(JSON.stringify(restored));
	});
	it("reports storage failure while retaining the recovered session for this page", async () => {
		vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } });
		fetchMock.mockResolvedValue(response(restored));
		const client = await import("./api");
		await expect(client.ensureSession()).rejects.toMatchObject({ code: "session_unavailable" });
		await client.recoverSession("saved-spell");
		expect(await client.ensureSession()).toEqual(restored);
		expect(client.sessionIsPersistent()).toBe(false);
	});
	it("rejects a stale response after recovery without flagging the new session as unauthorized", async () => {
		values.set(key, JSON.stringify(old));
		let finish!: (response: Response) => void;
		fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }));
		fetchMock.mockResolvedValueOnce(response(restored));
		const client = await import("./api");
		const notice = vi.fn();
		window.addEventListener("session-unauthorized", notice);
		const pending = client.api("/api/me");
		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		await client.recoverSession("saved-spell");
		finish(response({ error: "unauthorized" }, 401));
		await expect(pending).rejects.toMatchObject({ code: "session_changed" });
		expect(notice).not.toHaveBeenCalled();
		expect(values.get(key)).toBe(JSON.stringify(restored));
	});
	it("serializes first use across two tab modules using the shared storage lock", async () => {
		let queue = Promise.resolve();
		vi.stubGlobal("navigator", { locks: { request: (_name: string, work: () => Promise<unknown>) => {
			const result = queue.then(work);
			queue = result.then(() => undefined);
			return result;
		} } });
		fetchMock.mockResolvedValue(response(old, 201));
		const tab1 = await import("./api");
		vi.resetModules();
		const tab2 = await import("./api");
		expect(await Promise.all([tab1.ensureSession(), tab2.ensureSession()])).toEqual([old, old]);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
