// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import type { Question, Result } from "../shared/types";
const fixture = vi.hoisted(() => ({ saved: false, recovery: false, submissions: 0 }));
vi.mock("./sound", () => ({ sound: { enabled: false, unlock() {}, tap() {}, setEnabled() {} } }));
vi.mock("./effects", () => ({
	effectsSetting: { enabled: false, set() {} },
	Sequence: class {
		isSkipped = true;
		skip() {}
		async pause() {}
	},
	markLayer: () => ({ element: document.createElement("div"), async play() {} }),
	reveal: async () => {},
}));
vi.mock("./board", () => ({
	board: async () => {
		const element = document.createElement("figure");
		const tile = document.createElement("button");
		tile.className = "fixture-tile";
		tile.textContent = "1m";
		element.append(tile);
		let prompt: HTMLElement | null = null;
		return {
			element,
			setHand: (state: { selected: number | null }) => tile.setAttribute("aria-pressed", String(state.selected === 0)),
			onHandTap: (listener: ((i: number) => void) | null) => {
				tile.onclick = listener ? () => listener(0) : null;
			},
			prompt: (content: HTMLElement | null) => {
				prompt?.remove();
				prompt = content;
				if (content) element.append(content);
			},
			overlay: () => {},
			showBars: async () => {},
		};
	},
}));
vi.mock("./api", async (original) => {
	const base = await original<typeof import("./api")>();
	const question: Question = {
		id: 42,
		kind: "riichi",
		choices: [{ action: "d:1m" }, { action: "r:1m" }],
		scene: { hand: ["1m"], drawn: null, melds: [[], [], [], []], seat: 0 } as unknown as Question["scene"],
	};
	const result: Result = {
		...question,
		difficulty: "easy",
		answer: { action: "r:1m", score: 100, pitari: true },
		evaluation: { best: "r:1m", candidates: [{ action: "r:1m", q: 0, p: 1, score: 100 }] },
		human: null,
		sharer: { action: "r:1m", score: 100, pitari: true, name: "名無し#shared", identity: { name: null, publicId: "shared" } },
		playerName: "Fixture",
	};
	const stats = { answers: 1, scoreSum: 100, pitari: 1 };
	return {
		...base,
		currentPublicId: () => "fixture",
		ensureSession: async () => ({ publicId: "fixture", token: "fixture-only" }),
		reportInitialArrival: vi.fn(async () => {}),
		publicApi: vi.fn(async () => ({ comments: [] })),
		requestPending: () => false,
		api: vi.fn(async (path: string) => {
			if (path.startsWith("/api/players/"))
				return {
					publicId: "fixture",
					name: null,
					recoveryEnabled: fixture.recovery,
					all: stats,
					today: stats,
					daily: [],
					breakdown: null,
					history: [],
				};
			return fixture.saved ? { state: "result", result } : { state: "question", question };
		}),
		post: vi.fn(async () => {
			fixture.saved = true;
			fixture.submissions++;
			return { state: "result", result };
		}),
		issueRecovery: vi.fn(async () => {
			fixture.recovery = true;
			return "SYNTHETIC-CODE-ONLY";
		}),
	};
});
it("switches the active UI without losing an answer draft or a one-time recovery code", async () => {
	localStorage.setItem("mortal-jan.measurement-off", "1");
	history.replaceState(null, "", "/?measure=off");
	window.scrollTo = vi.fn();
	vi.stubGlobal("matchMedia", () => ({ matches: true }));
	await import("./main");
	const { api, issueRecovery } = await import("./api");
	const click = (selector: string) => {
		const el = document.querySelector<HTMLElement>(selector);
		expect(el).not.toBeNull();
		el!.click();
	};
	const language = async (value: string) => {
		const select = document.querySelector<HTMLSelectElement>(".language-select")!;
		select.value = value;
		select.dispatchEvent(new Event("change"));
		await vi.waitFor(() => expect(select.disabled).toBe(false));
	};
	await vi.waitFor(() => expect(document.querySelector(".riichi-toggle")).not.toBeNull());
	expect(document.documentElement.lang).toBe("ja");
	click(".riichi-toggle");
	click(".fixture-tile");
	document.querySelector<HTMLTextAreaElement>(".comments textarea")!.value = "コメントの下書き";
	const requests = vi.mocked(api).mock.calls.length;
	await language("en");
	expect(vi.mocked(api)).toHaveBeenCalledTimes(requests);
	expect(document.querySelector(".riichi-toggle")?.getAttribute("aria-pressed")).toBe("true");
	expect(document.querySelector(".fixture-tile")?.getAttribute("aria-pressed")).toBe("true");
	expect(document.querySelector<HTMLButtonElement>(".answer__actions button")?.disabled).toBe(false);
	expect(document.querySelector(".answer__question")?.textContent).toBe("Riichi? Which tile?");
	expect(document.querySelector<HTMLTextAreaElement>(".comments textarea")!.value).toBe("コメントの下書き");
	click(".answer__actions button");
	await vi.waitFor(() => expect(document.querySelector(".result__actions")).not.toBeNull());
	expect(document.body.textContent).toContain("Anonymous#shared");
	expect(document.querySelector<HTMLTextAreaElement>(".comments textarea")!.value).toBe("コメントの下書き");
	await language("ja");
	await language("en");
	expect(vi.mocked(api)).toHaveBeenCalledTimes(requests);
	expect(document.querySelector<HTMLTextAreaElement>(".comments textarea")!.value).toBe("コメントの下書き");
	expect(fixture.submissions).toBe(1);
	click(".comments__toggle");
	const previousInput = document.querySelector<HTMLTextAreaElement>(".comments textarea");
	fixture.saved = false;
	click(".result__actions .stamp-button");
	await vi.waitFor(() => expect(document.querySelector(".riichi-toggle")).not.toBeNull());
	expect(document.querySelector(".comments__toggle")?.getAttribute("aria-expanded")).toBe("true");
	expect(document.querySelector<HTMLTextAreaElement>(".comments textarea")).not.toBe(previousInput);
	expect(document.querySelector<HTMLTextAreaElement>(".comments textarea")!.value).toBe("");
	expect(fixture.submissions).toBe(1);
	click(".comments__toggle");
	click('.site-nav a[href^="/rules"]');
	await vi.waitFor(() => expect(document.querySelector("main")?.textContent).toContain("Game rules"));
	expect(location.search).toContain("lang=en");
	click('.site-nav a[href^="/u/"]');
	await vi.waitFor(() => expect(document.querySelector(".recovery-panel")).not.toBeNull());
	click(".recovery-panel > .recovery-actions button");
	await vi.waitFor(() =>
		expect(document.querySelector<HTMLTextAreaElement>(".recovery-issued textarea")?.value).toBe("SYNTHETIC-CODE-ONLY"),
	);
	await language("ja");
	await language("en");
	expect(document.querySelector<HTMLTextAreaElement>(".recovery-issued textarea")?.value).toBe("SYNTHETIC-CODE-ONLY");
	expect(issueRecovery).toHaveBeenCalledTimes(1);
	expect(document.querySelector(".recovery-panel")?.textContent).toContain("Recovery code");
	window.confirm = vi.fn(() => true);
	vi.mocked(issueRecovery).mockResolvedValueOnce("SYNTHETIC-REPLACEMENT");
	click(".recovery-panel > .recovery-actions button");
	await vi.waitFor(() =>
		expect(document.querySelector<HTMLTextAreaElement>(".recovery-issued textarea")?.value).toBe("SYNTHETIC-REPLACEMENT"),
	);
	click('.recovery-panel a[href^="/recover"]');
	await vi.waitFor(() => expect(document.querySelector('textarea[name="spell"]')).not.toBeNull());
	document.querySelector<HTMLTextAreaElement>('textarea[name="spell"]')!.value = "UNSUBMITTED-FIXTURE";
	await language("ja");
	expect(document.querySelector<HTMLTextAreaElement>('textarea[name="spell"]')?.value).toBe("UNSUBMITTED-FIXTURE");
	expect(localStorage.getItem("mortal-jan.measurement-off")).toBe("1");
});

it("keeps a call selection when rebuilding the answer controls in another language", async () => {
	const { answerWindow, answerDraft } = await import("./answer");
	const { setLocale } = await import("./i18n");
	const view = { element: document.createElement("div"), setHand() {}, onHandTap() {}, prompt() {}, overlay() {}, async showBars() {} };
	const question: Question = {
		id: 99,
		kind: "call",
		choices: [{ action: "pass" }, { action: "pon", consumed: ["1m", "1m"] }],
		scene: { hand: ["1m", "1m"], drawn: null, target: { actor: 1, pai: "1m" } } as unknown as Question["scene"],
	};
	setLocale("ja");
	const before = answerWindow(question, view, vi.fn());
	before.querySelector<HTMLButtonElement>(".option")!.click();
	setLocale("en");
	const after = answerWindow(question, view, vi.fn(), answerDraft(before));
	expect(after.querySelector('.option[aria-pressed="true"]')?.textContent).toBe("Pass");
	expect(after.querySelector<HTMLButtonElement>(".answer__actions button")!.disabled).toBe(false);
	setLocale("ja");
});
