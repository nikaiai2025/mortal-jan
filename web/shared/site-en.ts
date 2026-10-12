import { DAILY_ANSWER_LIMIT, RANKING_MIN_ANSWERS } from "./rules.ts";

export const EN_SITE_NAME = "Mortal Mahjong Practice";
export const EN_NAV_LABELS = ["Practice", "Daily 10", "Problem sets", "My stats", "Rankings", "Rules"] as const;
export const EN_THEME_LABELS: Record<string, string> = { all: "All", easy: "Easy", normal: "Normal", hard: "Hard", discard: "Discard", riichi: "Riichi", call: "Calls" };
export const EN_PUBLIC_PAGES = {
	"/": { title: `Riichi mahjong practice with AI scoring | ${EN_SITE_NAME}`, description: "Practise 10,000 riichi mahjong decisions for free, with no sign-up. Compare your discards, riichi and calls with evaluations from the third-party mortal-298k model." },
	"/daily": { title: `Daily 10 | ${EN_SITE_NAME}`, description: "Try the same ten riichi mahjong problems as everyone else. New problems arrive at midnight Japan time. Finish all ten to see your score and today's ranking." },
	"/sets": { title: `Problem sets by difficulty and decision | ${EN_SITE_NAME}`, description: "Practise ten mahjong decisions at a time. Choose Easy, Normal or Hard, or focus on discards, riichi or calls. You can also open a problem by number." },
	"/ranking": { title: `Rankings | ${EN_SITE_NAME}`, description: "Compare your daily and all-time mahjong practice results. See answers, average scores and perfect-match rates, or scores for today's ten problems." },
	"/about": { title: `About this free mahjong practice site | ${EN_SITE_NAME}`, description: "A free riichi mahjong practice site with 10,000 problems and AI scoring. No sign-up required. Your first answer is saved so you can review it later." },
	"/rules": { title: `How to play, scoring and game rules | ${EN_SITE_NAME}`, description: "Learn how problems are scored and how difficulty, stats and rankings work. Four-player East–South games follow Tenhou rules. Scoring uses the third-party mortal-298k model." },
};

export const EN_RULE_SECTIONS: readonly (readonly [string, readonly string[]])[] = [
	["Game rules", [
		"Four-player East–South games (hanchan), following Tenhou rules. All four players use the same strong AI, trained on high-level Tenhou games. Its distributor reports an average S+ on Mahjong Soul's MAKA test.",
		"Players start with 25,000 points. The game extends into West if no one has 30,000 points after the final South round. It ends if a player's score falls below zero.",
		"One red five in each suit. Open tanyao, atozuke, ippatsu, ura-dora and kan-dora are enabled.",
		"Abortive draws are enabled for nine terminals and honours, four identical first wind discards, four riichi declarations and four kans. Three simultaneous ron calls do not cause an abortive draw.",
	]],
	["How to play", [
		"After answering, choose Random or Number order beside Next problem. Use Problem sets to choose a difficulty or decision type, or to open a problem by number.",
		"Daily 10 gives everyone the same ten problems, refreshed at midnight Japan time. If you have already answered one elsewhere on the site, that answer counts.",
		"Each problem accepts one answer. You cannot retry it: your first answer stays on your record. You can review answered problems at any time, or work through Misses on your stats page.",
		`You can answer up to ${DAILY_ANSWER_LIMIT.toLocaleString("en-US")} problems a day. The limit resets at midnight Japan time.`,
	]],
	["Scoring", [
		"The AI assigns each option an evaluation (%). Your score is your move's evaluation ÷ the best move's evaluation × 100. Matching the best move earns 100 points.",
		"Difficulty (Easy, Normal or Hard) depends on how strongly the AI favours its best move.",
		"Evaluations use mortal-298k, a set of weights distributed by a third party for Mortal. It is not an official model.",
	]],
	["Stats and rankings", [
		"Your stats show all-time and today's answers, average score and perfect-match rate, plus a chart of daily average scores. Days without answers are left out.",
		`All-time rankings cover answers, average score and perfect-match rate. You need at least ${RANKING_MIN_ANSWERS} answers for the latter two. Each row's coloured bar shows the proportions of Easy, Normal and Hard problems answered.`,
		"Today's ranking includes players who finish the Daily 10, ordered by score. Ties are broken by perfect matches, then by earlier completion.",
		"All-time rankings and other players' stats refresh every ten minutes.",
	]],
];

const section = (title: string, text: string) => `<section class="rules__section"><h2>${title}</h2>${text}</section>`;
const header = (title: string, text = "") => `<header class="page-head"><h1>${title}</h1>${text ? `<p>${text}</p>` : ""}</header>`;
export function englishContent(path: keyof typeof EN_PUBLIC_PAGES): string {
	if (path === "/rules") return header("Rules") + EN_RULE_SECTIONS.map(([title, items]) => section(title, `<ul>${items.map(item => `<li>${item}</li>`).join("")}</ul>`)).join("");
	if (path === "/about") return header("Practise mahjong decisions with AI scoring", `${EN_SITE_NAME} is free to use. No sign-up required.`)
		+ section("Choose from 10,000 problems", '<p>Practise discards, riichi and calls in random or number order. Problem sets let you choose a difficulty or decision type. Everyone gets the same Daily 10, refreshed at midnight Japan time.</p><p><a href="/" class="stamp-button">Start practising</a> <a href="/sets">Choose a problem set</a></p>')
		+ section("Compare your answer with the AI", '<p>Problems come from games played by Mortal against itself. Scoring uses the third-party mortal-298k model, not an official model. After answering, compare your choice with the AI evaluation of each option.</p><p><a href="/rules">How to play and how scoring works</a></p>')
		+ section("Save your first answer and review it later", '<p>Each problem records one answer. Your stats show answers, average score and perfect-match rate, and let you review misses. To move your progress to another device, create and save a recovery code on your stats page.</p><p><a href="/daily">Try the Daily 10</a></p>')
		+ section("Usage measurement", '<p>To help improve the site, we store an anonymous ID on your device and count where your first visit came from, when you started answering, and whether you answered again within seven days. This measurement does not store names, IP addresses or recovery codes. Only the site owner can view the totals. You can turn measurement off and keep practising.</p><p data-measurement-control>Enable JavaScript to change your measurement preference.</p>');
	if (path === "/") return header("Practise mahjong decisions with AI scoring", `${EN_SITE_NAME} is free and requires no sign-up. Compare your answers with evaluations from mortal-298k, a model distributed by a third party for Mortal.`)
		+ section("Practise discards, riichi and calls", '<p>Choose from 10,000 problems in random or number order. Try the Daily 10 or pick a set by difficulty.</p><p><a href="/daily" class="stamp-button">Try the Daily 10</a> <a href="/sets">Choose a problem set</a> <a href="/rules">How to play and scoring</a></p>')
		+ section("Review the AI evaluations after answering", '<p>Compare the options to see which moves the AI favours. Evaluations are a reference, not a guarantee of the best play in a real game or of improvement.</p><p><a href="/about">About the site and scoring model</a></p>');
	if (path === "/daily") return header("Daily 10", "Everyone gets the same ten mahjong problems each day. New problems arrive at midnight Japan time.") + section("Finish ten problems to see your results", '<p>See your score and perfect matches after answering. Finish all ten to enter today\'s ranking.</p><p><a href="/" class="stamp-button">Practise</a> <a href="/ranking">See rankings</a> <a href="/rules">How to play and scoring</a></p>');
	if (path === "/sets") return header("Mahjong problem sets", "Choose a difficulty or the kind of decision you want to practise.") + section("Choose a difficulty or decision type", '<p>Each set has ten problems. Choose Easy, Normal or Hard, or focus on discards, riichi or calls. You can also open a problem by number.</p><p><a href="/rules">Difficulty and scoring</a> <a href="/daily">Daily 10</a></p>');
	return header("Rankings", "Compare answers, average scores, perfect-match rates and Daily 10 results.") + section("All-time and Daily 10 results", '<p>All-time rankings show answers, average scores and perfect-match rates. Today\'s ranking includes players who finish the Daily 10, ordered by score. Ties are broken by perfect matches, then by earlier completion.</p><p><a href="/daily" class="stamp-button">Try the Daily 10</a> <a href="/rules">Ranking rules</a></p>');
}

export const EN_FOOTER = `<p><a href="/about">About this site</a> · <a href="/recover">Recover your progress</a></p>
<p>Created by <a href="https://x.com/shika_bakudan">@shika_bakudan</a> with Claude and ChatGPT. Hosted on Cloudflare's free tier at no server cost.<br>Scoring: <a href="https://github.com/Equim-chan/Mortal">Mortal</a>, using third-party mortal-298k weights. <a href="https://github.com/nikaiai2025/mortal-jan">Source code</a> (AGPL-3.0).</p>`;
