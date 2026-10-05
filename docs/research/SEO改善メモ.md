# SEO改善メモ

対象: `main` の `b2d261739d76e08ec706a4db3e5f4d2deb0dce5a` と公開URL `https://mortal-jan.shika.workers.dev/`。

## 確認した状態

- `/robots.txt` と `/sitemap.xml` はHTTP 200。robots.txtは全体を許可し、sitemapはトップ・`/daily`・`/sets`・`/ranking`・`/rules`・`/about` の6 URLを列挙。
- 6つの公開URLはHTTP 200で、固有のtitle・description・canonicalを返す。Google所有権確認metaとトップのWebSite JSON-LDも配信中。
- `/about` と `/rules` は初期HTMLに本文と見出しがある。一方、トップ・`/daily`・`/sets`・`/ranking` は初期HTMLのmainが「読み込み中…」だけで、ページの説明はfooterにあった。
- `/q/12345`・`/u/seo-audit-missing`・`/recover` はHTTP 200だが、`X-Robots-Tag: noindex` を返す。
- 存在しないURLはHTTP 200でSPA fallbackの初期HTMLを返し、mainは読み込み中、初期レスポンスにrobots noindexはない。クライアント側は未知URLでnoindexを追加する。GoogleはSPAのエラーページにJavaScriptでnoindexを追加する方法を案内しているため、今回これだけで不具合とは判定せず、観測事項として残す。
- Search Consoleの表示回数・クエリ・登録状態は今回読んでいない。検索順位や流入の変化は評価していない。

## 今回の変更

- 既存6公開URLを維持し、トップ・今日の10問・問題集・ランキングに、機能説明・見出し・関連ページへのリンクを初期HTMLにも出す。問題データや利用者データは読まず、URL・canonical・sitemapの追加もしない。
- `seoHtml` が `pageMeta.noindex` をrobots metaとして出力するようにし、その出力と公開ページでnoindexにならないことの回帰テストを追加。追加した紹介文に問題局面・問題番号・候補手・解答・モデル値は含めていない。

## 次に必要な確認

- 公開前にPRの `Check` workflowを通し、型チェック・全テスト・ビルドの成功を確認する。
- Search Consoleでページ別の登録状況・検索クエリ・表示回数を確認できたら、既存6ページの内容を調整する。新規ページや順位の評価は、その需要データが得られてから判断する。

参考: [Google Search Central — JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
