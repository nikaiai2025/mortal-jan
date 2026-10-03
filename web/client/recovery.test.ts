import { expect, it } from "vitest";
import { spellTextFile } from "./recovery";

it("downloads the displayed spell as text with the requested name and Japan timestamp", () => {
	expect(spellTextFile("abcd-efgh", new Date("2026-10-03T15:04:05Z"))).toEqual({
		filename: "もーたる何切る復活の呪文_20261004_000405.txt",
		content: "abcd-efgh\r\n",
	});
});
