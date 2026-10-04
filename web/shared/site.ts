import { DAILY_ANSWER_LIMIT, RANKING_MIN_ANSWERS, SET_THEME_LABELS, SET_THEMES } from "./rules.ts";

export const SITE_NAME = "もーたる何切る教室";
export const SITE_URL = "https://mortal-jan.shika.workers.dev";
export const NAV_LINKS = [
	["出題", "/"], ["今日の10問", "/daily"], ["問題集", "/sets"],
	["成績", "/u/me"], ["ランキング", "/ranking"], ["ルール", "/rules"],
] as const;

export const PUBLIC_PAGES = {
	"/": { title: `麻雀の何切る問題をAIで採点｜${SITE_NAME}`, description: "麻雀の何切る問題を、Mortal用のモデル mortal-298k の評価で採点。登録不要・無料で1万問に挑戦できます。打牌・リーチ・鳴きの問題を、難易度別や今日の10問で練習できます。" },
	"/daily": { title: `今日の10問｜麻雀の何切る問題｜${SITE_NAME}`, description: "全員共通の麻雀の何切る問題に、毎日10問挑戦できます。日本時間0時に更新。10問の得点とピタリ数を確認し、今日のランキングで成績を比べられます。" },
	"/sets": { title: `難易度別・打牌・リーチ・鳴きの問題集｜${SITE_NAME}`, description: "麻雀の何切る問題を10問ずつ練習できる問題集。かんたん・ふつう・むずかしいの難易度と、打牌・リーチ・鳴きの種類で選べます。問題番号を指定して開くこともできます。" },
	"/ranking": { title: `何切る問題のランキング｜${SITE_NAME}`, description: "麻雀の何切る問題の成績を、今日の10問と全期間のランキングで確認できます。全期間は回答数・平均点・ピタリ率、今日の10問は10問を解き終えた得点で比べます。" },
	"/about": { title: `登録不要・無料の麻雀何切る練習サイトについて｜${SITE_NAME}`, description: "もーたる何切る教室は、麻雀の何切る問題をMortalの評価で採点する無料の練習サイトです。登録不要で1万問に挑戦でき、最初の回答を記録して後から見直せます。" },
	"/rules": { title: `遊び方・採点・対局ルール｜${SITE_NAME}`, description: "麻雀の何切る問題の遊び方、Mortalの評価による採点、難易度、成績とランキングを説明します。四人麻雀の東南戦・天鳳準拠・赤ドラあり。採点は第三者配布のモデル mortal-298k を使います。" },
} as const;
export type PublicPath = keyof typeof PUBLIC_PAGES;

export const RULE_SECTIONS: readonly (readonly [string, readonly string[]])[] = [
	["対局ルール", [
		"四人麻雀の東南戦（半荘戦）で、ルールは天鳳準拠です。4人とも同じAIが打っていて、全員ガチレベルの打ち手です。天鳳の上級者の対局で学習したAIで、配布者によると雀魂のMAKAテストで平均S+です。",
		"持ち点25,000点。オーラスで30,000点に誰も届かなければ西入します。持ち点がマイナスになると終了（トビ）。",
		"赤ドラあり（5萬・5筒・5索に各1枚）。喰いタン・後付けあり。一発・裏ドラ・槓ドラあり。",
		"途中流局あり（九種九牌・四風連打・四家立直・四槓散了）。3人が同時にロンしても流局になりません。",
	]],
	["遊び方", [
		"出題は「ランダム」か「番号順」を、回答後の「次の問題へ」の近くで切り替えられます。難易度や種類で選ぶときと、番号を指定して開くときは問題集のページを使います。",
		"「今日の10問」は全員に同じ10問が日替わり（日本時間0時）で出ます。別の画面で先に解いた問題は、その回答を使います。",
		"同じ問題は1回だけ解けます。解き直しはできず、最初の回答が記録に残ります。回答済みの問題はいつでも見直せます（成績表の「間違い」から順にたどれます）。",
		`出題は1日${DAILY_ANSWER_LIMIT.toLocaleString("ja-JP")}問までです（日本時間0時に戻ります）。`,
	]],
	["採点", [
		"AIは候補ごとに評価（%）を出します。得点は「あなたの手の評価 ÷ 最善手の評価 × 100」で、最善手と同じなら100点です。",
		"難易度（かんたん・ふつう・むずかしい）は、AIが最善手をどれだけ確信しているかで分けています。",
		"評価に使うAIは、Mortal用に第三者が配布している重み mortal-298k です（公式モデルではありません）。",
	]],
	["成績とランキング", [
		"成績表では、全期間と今日の回答数・平均点・ピタリ率と、1日ごとの平均点のグラフを見られます（回答のない日は除きます）。",
		`全期間のランキングは回答数・平均点・ピタリ率です。平均点とピタリ率には${RANKING_MIN_ANSWERS}問以上回答した人が載ります。各行の帯は、かんたん・ふつう・むずかしいの回答数の比です。`,
		"今日のランキングは、今日の10問を解き終えた人の得点順です（同点はピタリ数、次に早く終えた順）。",
		"全期間のランキングと、ほかの人の成績表は10分ごとに更新します。",
	]],
];

export const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

export function pageMeta(path: string): { title: string; description: string; canonical: string | null; noindex: boolean } {
	if (Object.hasOwn(PUBLIC_PAGES, path)) return { ...PUBLIC_PAGES[path as PublicPath], canonical: `${SITE_URL}${path}`, noindex: false };
	const problem = path.match(/^\/q\/([1-9]\d*)$/);
	const set = path.match(/^\/sets\/([a-z]+)\/([1-9]\d*)$/);
	let label = "ページが見つかりません";
	if (problem) label = `何切る問題 第${problem[1]}問`;
	else if (set && SET_THEMES.includes(set[1] as typeof SET_THEMES[number])) label = `問題集 ${SET_THEME_LABELS[set[1] as typeof SET_THEMES[number]]}編 第${set[2]}集`;
	else if (/^\/u\/[a-z0-9]+$/.test(path)) label = "成績表";
	else if (path === "/recover") label = "成績の復旧";
	return { title: `${label}｜${SITE_NAME}`, description: "", canonical: null, noindex: true };
}

/** The same public text is used in the built HTML and after SPA navigation. */
export function publicContent(path: "/rules" | "/about"): string {
	if (path === "/rules") return '<header class="page-head"><h1>ルール</h1></header>' + RULE_SECTIONS.map(([title, items]) => `<section class="rules__section"><h2>${escapeHtml(title)}</h2><ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>`).join("");
	return `<header class="page-head"><h1>麻雀の何切る問題をAIで採点</h1><p>${escapeHtml(SITE_NAME)}は、登録不要・無料で使える麻雀の練習サイトです。</p></header>
		<section class="rules__section"><h2>1万問から、練習したい問題を選ぶ</h2><p>打牌・リーチ・鳴きの問題を、ランダムや番号順で出題します。問題集では難易度や種類を選べます。今日の10問は全員共通で、日本時間0時に入れ替わります。</p><p><a href="/" class="stamp-button">何切る問題を解く</a> <a href="/sets">問題集を選ぶ</a></p></section>
		<section class="rules__section"><h2>回答後にAIの評価を確認する</h2><p>問題は麻雀AI Mortal同士の対局から作っています。採点には第三者配布のモデル mortal-298k を使い、公式モデルではありません。回答後に候補ごとのAI評価を見て、自分の判断と比べられます。</p><p><a href="/rules">遊び方と採点のルール</a></p></section>
		<section class="rules__section"><h2>最初の回答を記録して、後から見直す</h2><p>同じ問題への回答は1回だけ記録されます。成績表で回答数・平均点・ピタリ率を確認し、間違えた問題を見直せます。別の端末へ成績を引き継ぐときは、成績表で復活の呪文を発行して保存してください。</p><p><a href="/daily">今日の10問に挑戦する</a></p></section>
		<section class="rules__section"><h2>利用状況の計測</h2><p>サイトの改善のため、端末に匿名の識別番号を保存し、最初の訪問元・回答を始めた時期・7日以内に再び回答したかを集計します。氏名・IPアドレス・復活の呪文は、この計測に保存しません。集計は運営者だけが確認し、利用状況の計測を止めても問題を解けます。</p><p data-measurement-control>計測の設定はJavaScriptを有効にすると変更できます。</p></section>`;
}

export function footerContent(path: string): string {
	const meta = pageMeta(path);
	const summary = meta.canonical && path !== "/about" && path !== "/rules" ? `<p>${escapeHtml(meta.description)}</p>` : "";
	return `${summary}<p><a href="/about">このサイトについて</a> · <a href="/recover">成績を復旧する</a></p>
		<p>制作: <a href="https://x.com/shika_bakudan">@shika_bakudan</a>（AIで開発。Cloudflareの無料枠で動かしているのでサーバー代は0円。使用ツール: Claude, ChatGPT）<br>採点: 麻雀AI <a href="https://github.com/Equim-chan/Mortal">Mortal</a>（第三者配布の重み mortal-298k） / <a href="https://github.com/nikaiai2025/mortal-jan">ソースコードは公開しています</a>（AGPL-3.0）</p>`;
}

export function seoHtml(template: string, path: string): string {
	const meta = pageMeta(path);
	// index.html also serves as the SPA fallback: only the home HTTP header sets its canonical.
	const canonical = meta.canonical && path !== "/" ? `<link rel="canonical" href="${escapeHtml(meta.canonical)}" />` : "";
	const structured = path === "/" ? `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "WebSite", name: SITE_NAME, url: `${SITE_URL}/` })}</script>` : "";
	const imageAlt = `${SITE_NAME}の紹介。登録不要・1万問。赤い花丸と100点の文字。`;
	const head = `<title>${escapeHtml(meta.title)}</title><meta name="description" content="${escapeHtml(meta.description)}" />
		<meta property="og:site_name" content="${SITE_NAME}" /><meta property="og:locale" content="ja_JP" /><meta property="og:type" content="website" />
		<meta property="og:title" content="${escapeHtml(meta.title)}" /><meta property="og:description" content="${escapeHtml(meta.description)}" /><meta property="og:url" content="${escapeHtml(meta.canonical ?? SITE_URL + "/")}" />
		<meta property="og:image" content="${SITE_URL}/og.png" /><meta property="og:image:type" content="image/png" /><meta property="og:image:width" content="1200" /><meta property="og:image:height" content="630" />
		<meta property="og:image:alt" content="${escapeHtml(imageAlt)}" /><meta name="twitter:card" content="summary_large_image" /><meta name="twitter:image:alt" content="${escapeHtml(imageAlt)}" />${canonical}${structured}`;
	const content = path === "/rules" || path === "/about" ? publicContent(path) : '<p class="loading">読み込み中…</p>';
	const body = `<div id="static-page"><header class="site-header"><a class="brand" href="/">${SITE_NAME}</a><nav class="site-nav" aria-label="メニュー">${NAV_LINKS.map(([label, href]) => `<a href="${href}">${label}</a>`).join("")}</nav></header><main class="sheet">${content}</main><footer class="site-footer">${footerContent(path)}</footer></div>`;
	return template.replace(/<!-- site-meta -->[\s\S]*?<!-- \/site-meta -->/, `<!-- site-meta -->${head}<!-- /site-meta -->`).replace(/<!-- static-page -->[\s\S]*?<!-- \/static-page -->/, `<!-- static-page -->${body}<!-- /static-page -->`);
}
