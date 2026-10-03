import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DailySet, SetProblem } from "../shared/types";
import { api } from "./api";
import { showProblem } from "./play";
import { type App, dailyPlay, setPlay } from "./screens";

vi.mock("./api", async (original) => ({ ...await original<typeof import("./api")>(), api: vi.fn() }));
vi.mock("./play", () => ({ showProblem: vi.fn() }));

const app: App = { navigate: vi.fn(), refresh: vi.fn() };
const problems: SetProblem[] = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, difficulty: "normal", answer: null }));
const daily: DailySet = { day: "2026-10-03", problems, result: null, playerName: "確認用" };

beforeEach(() => {
	vi.clearAllMocks();
	vi.stubGlobal("location", { origin: "https://example.com" });
});
afterEach(() => vi.unstubAllGlobals());

it.each(["daily", "set"] as const)("does not assign a problem after leaving a %s screen with a delayed response", async (kind) => {
	const state = { isConnected: true };
	const root = state as HTMLElement;
	let release!: (value: unknown) => void;
	vi.mocked(api).mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
	const rendering = kind === "daily" ? dailyPlay(root, app) : setPlay(root, "all", 1, app);
	state.isConnected = false;
	release(kind === "daily" ? daily : { set: 1, problems, playerName: "確認用" });
	await rendering;
	expect(api).toHaveBeenCalledTimes(1);
	expect(showProblem).not.toHaveBeenCalled();
});

it("continues assigning the first unanswered problem while the daily screen is active", async () => {
	const root = { isConnected: true } as HTMLElement;
	const response = { state: "question", question: { id: 1 } };
	vi.mocked(api).mockResolvedValueOnce(daily).mockResolvedValueOnce(response);
	await dailyPlay(root, app);
	expect(vi.mocked(api).mock.calls.map(([path]) => path)).toEqual(["/api/daily", "/api/problems/1"]);
	expect(showProblem).toHaveBeenCalledWith(root, response, expect.objectContaining({ nextLabel: "次の問題へ" }));
});
