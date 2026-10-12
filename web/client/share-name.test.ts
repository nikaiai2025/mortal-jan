// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Result } from "../shared/types";
import { setLocale } from "./i18n";
import { problemCard, setCard } from "./share";
import { drawScene } from "./scene";

vi.mock("./scene", async (original) => ({
 ...await original<typeof import("./scene")>(),
 preloadScene: vi.fn(async () => {}),
 drawScene: vi.fn(() => ({ tags: [] })),
 drawTile: vi.fn(),
}));
vi.mock("./marks", async (original) => ({ ...await original<typeof import("./marks")>(), paintMark: vi.fn() }));
const texts: string[] = [];
beforeEach(() => {
 texts.length = 0;
 vi.clearAllMocks();
 Object.defineProperty(document, "fonts", { configurable: true, value: { load: async () => [] } });
 vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
  return new Proxy({ canvas: this, measureText: (text: string) => ({ width: text.length * 10 }), fillText: (text: string) => texts.push(text) }, {
   get: (target, key) => key in target ? target[key as keyof typeof target] : () => {},
  }) as unknown as CanvasRenderingContext2D;
 });
});
afterEach(() => { vi.restoreAllMocks(); setLocale("ja"); });
it.each((["discard", "riichi", "call"] as const).flatMap((kind) => [null, "名無し#abcd2345", "雀士"].map((name) => ({ kind, name }))))("uses raw identity in $kind problem and set share text for $name", async ({ kind, name }) => {
 setLocale("en");
 const playerIdentity = { name, publicId: "abcd2345" };
 const playerName = name ?? "名無し#abcd2345";
 const expected = name ?? "Anonymous#abcd2345";
 const action = kind === "call" ? "pass" : kind === "riichi" ? "r:1m" : "d:1m";
 const result: Result = {
  id: 1, kind, scene: { hand: ["1m"], drawn: null } as Result["scene"], choices: [{ action }], difficulty: "normal",
  answer: { action, score: 100, pitari: true },
  evaluation: { best: action, candidates: [{ action, score: 100, p: 1, q: 0 }] },
  human: null, sharer: null, playerName, playerIdentity,
 };
 await problemCard(result, result);
 expect(vi.mocked(drawScene).mock.calls[0][3]?.tags?.[0].text).toContain(`${expected}’s answer`);
 await setCard("Today’s 10", [{ id: 1, difficulty: "normal", answer: result.answer }], playerName, playerIdentity);
 expect(texts).toContain(expected);
});
