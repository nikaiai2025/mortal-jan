import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let values: Map<string, string>;
beforeEach(() => {
	vi.resetModules();
	values = new Map();
	vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
	vi.stubGlobal("window", new EventTarget());
});
afterEach(() => vi.unstubAllGlobals());

describe("optional acquisition measurement", () => {
	it("preserves the first source across reloads instead of overwriting it with a later post", async () => {
		let client = await import("./acquisition");
		client.startAcquisition(new URL("https://example.com/q/1?utm_source=x&utm_medium=organic_social&utm_campaign=trial&utm_content=post-01"), "");
		const first = client.acquisitionVisitorId();
		vi.resetModules();
		client = await import("./acquisition");
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
		vi.stubGlobal("fetch", fetchMock);
		client.startAcquisition(new URL("https://example.com/?utm_source=youtube&utm_campaign=later&utm_content=post-02"), "");
		await client.reportArrival();
		expect(client.acquisitionVisitorId()).toBe(first);
		expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ source: "x", campaign: "trial", content: "post-01" });
	});
	it("excludes an operator browser and creates no transient ID when storage is blocked", async () => {
		const client = await import("./acquisition");
		const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
		client.startAcquisition(new URL("https://example.com/?measure=off"), "");
		await client.reportArrival();
		expect(client.acquisitionVisitorId()).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
		vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); } });
		client.startAcquisition(new URL("https://example.com/"), "");
		expect(client.acquisitionVisitorId()).toBeNull();
	});
	it("ignores a collector failure and still saves the gameplay answer", async () => {
		values.set("mortal-jan.session", JSON.stringify({ token: "token", publicId: "player" }));
		const tracker = await import("./acquisition");
		tracker.startAcquisition(new URL("https://example.com/"), "");
		const fetchMock = vi.fn().mockRejectedValueOnce(new Error("network")).mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ state: "result" }))));
		vi.stubGlobal("fetch", fetchMock);
		const api = await import("./api");
		expect(await api.post("/api/problems/1/answer", { action: "d:1m" })).toEqual({ state: "result" });
		expect(fetchMock.mock.calls[1][1].headers.get("X-Mortal-Visitor")).toBe(tracker.acquisitionVisitorId());
		await api.post("/api/problems/2/answer", { action: "d:1m" });
		expect(fetchMock.mock.calls.filter(([path]) => path === "/api/acquisition")).toHaveLength(1);
	});
});
