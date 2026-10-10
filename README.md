# mortal-jan

麻雀AI [Mortal](https://github.com/Equim-chan/Mortal) の評価で採点する「何切る問題」Webサービス。
問題はMortal同士の自己対局から生成する。

- 仕様: [docs/spec/プロダクト仕様.md](docs/spec/プロダクト仕様.md)
- 構成: [docs/spec/アーキテクチャ.md](docs/spec/アーキテクチャ.md)
- 集客の計測と投稿リンク: [tools/acquisition/README.md](tools/acquisition/README.md)

## 導入（Windows）

[PowerShell 7](https://learn.microsoft.com/en-us/powershell/scripting/install/install-powershell-on-windows)（`pwsh`）と[git](https://git-scm.com/install/windows)を導入し、初めて使う場合はリポジトリを取得する。

```powershell
git clone https://github.com/nikaiai2025/mortal-jan.git
cd mortal-jan
```

以降は、指定がなければリポジトリ直下で実行する。既存の問題データやローカルD1がある場合、Web開発は下の「Web」の手順で再開できる。問題生成を再開する場合は「問題生成」の環境を構築する。

`generated/`と`generator/seeds.local.json`はGit管理対象外。別のPCで同じ問題集を扱う場合はバックアップを引き継ぐ。

## 問題生成（Windows）

[Python 3.12（64-bit）](https://www.python.org/downloads/windows/)と[Rust（cargo、MSVC版）](https://rust-lang.org/tools/install/)が必要。`python --version`で3.12系が選ばれるようPATHを設定する。Rustのビルドには[Visual StudioのC++ビルドツールとWindows SDK](https://rust-lang.github.io/rustup/installation/windows-msvc.html)も必要。

初回導入・`.mortal/`削除後の再構築は次の手順で行う。

```powershell
pwsh -File tools/mortal/setup.ps1
.mortal/venv/Scripts/python.exe -c "from generator.runtime import load_model; load_model()"  # 重みの読み込みを確認
.mortal/venv/Scripts/python.exe -m pytest generator/tests
```

セットアップは固定版のソース・重みを取得し、保存済みパッチの適用、Python仮想環境の作成、libriichiのビルドを行う。生成済みの問題データやseedは変更しない。

Python依存の版は固定していないため、再構築時も上の読み込み確認とテストを実行する。

問題を初めて生成するときは次を実行する。生成物は `generated/` に出る。公開済みの問題に追加する場合は、下の `-Extend` の手順を使う。

```powershell
pwsh -File tools/generate-problems.ps1     # 自己対局→全判断の評価→抽出の設定の導出→問題データ
```

`generate-problems.ps1` は中断しても、再実行すれば続きから処理する。導出した抽出の設定（鳴きの閾値・鳴き枠とリーチ枠の確率）は `generator/calibration.json` に保存される。

問題ごとの1局ぶんの牌譜も天鳳JSONに変換し、`generated/problem-logs/` とD1投入用の `generated/problem-logs.sql` に出力する。既存の問題から牌譜だけを作る場合は `.mortal/venv/Scripts/python.exe -m generator.export_logs`。元ログのハッシュと問題の局面を照合してから出力する。元ログに記録されていない符・翻・役名・途中流局の理由は含まない。公式レビューの判断に必要な手牌・行動・点数移動は含む。生成物はGit管理対象外。

公開後に難易度の閾値（`generator/scoring.py` の `DISCARD_THRESHOLDS`）を変えるときは、`python -m generator.calibrate` で鳴きの閾値を導き直してから `python -m generator.relabel` を実行し、できた `generated/relabel.sql` を本番D1に流す（`npx wrangler d1 execute DB --remote --file ../generated/relabel.sql`）。問題・回答・成績はそのままで、問題の難易度と難易度別問題集の並び、ランキングの難易度別の回答数だけが変わる（Workerのテーマ別の問題数は最大10分で追従する）。

公開後に問題を増やすときは、`pwsh -File tools/generate-problems.ps1 -Hanchan 1500 -Problems 12000 -Extend` のように半荘数と総問題数を増やして実行する（自己対局と評価は済んだ分を飛ばし、抽出の設定は導き直さず、投入済みの問題と番号はそのまま末尾に追加する）。追加分は `python -m generator.load --after 10000`（投入済みの問題数）でSQLにして本番D1に流す。回答・成績は残り、問題集はテーマごとに末尾に増える。

初回実行時に、本番の問題集用の非公開の乱数seed（`generator/seeds.local.json`、git対象外）を作る。公開コードとseedがあれば問題と答えを再現できるため、このファイルは公開せず、バックアップしておく。

## Web（`web/`）

Node.js 24が必要。ローカルD1への初回投入には `generated/problems.sql` と `generated/problem-logs.sql` が必要。SQLがない場合は上の問題生成手順を済ませ、`.mortal/venv/Scripts/python.exe -m generator.load` で問題投入用SQLを作る。既存のローカルD1を使う場合は、問題・牌譜の投入コマンドを省く。

```powershell
cd web
npm ci
npm run db:migrate:local    # ローカルD1にテーブルを作る
npm run db:load:local       # 初回のみ: ローカルD1に問題を入れる
npm run db:load:logs:local  # 初回のみ: 変換済み牌譜を入れる
npm run dev                 # http://localhost:5173
npm test; npm run typecheck
```

配信はGitHub Actionsの「Deploy」ワークフローを手動で実行する（リポジトリのSecretに `CLOUDFLARE_API_TOKEN` が必要）。本番D1への初回問題投入は `npx wrangler d1 execute DB --remote --file ../generated/problems.sql` で行う。公開後の問題追加は上の `--after` の手順に従い、既存の問題・回答・成績を保持する。

牌譜はマイグレーション0004の適用後に `npx wrangler d1 execute DB --remote --file ../generated/problem-logs.sql` で追加する。繰り返しても問題・回答・成績は変わらず、生成元の一致する問題だけに対応する牌譜が入る。問題の追加分だけなら `generator.export_logs --after N`（投入済みの問題数）でSQLを作る。

既存問題にリーチ宣言時の河の枚数を補うときは `python -m generator.refresh_scenes` を実行し、`generated/refresh-scenes.sql` をD1に流す。元ログと既存の局面を全件照合し、生成元の一致する問題の `scene` だけを更新する。問題番号・評価・回答・成績は保持し、`generated/problems.jsonl` も更新する。補完前の問題はリーチ者自身の宣言牌以降だけを囲み、他家の境界は推測しない。

## 運営による成績の復旧

復活の呪文を保存していない利用者への発行手順は [tools/recovery/README.md](tools/recovery/README.md)。

## 公開後の検索設定

初回配信後、[Google Search Console](https://search.google.com/search-console/) に本番URLの「URLプレフィックス」プロパティを追加し、「HTMLタグ」の方式で所有権を確認する。Googleが指定する `google-site-verification` のmetaタグを `web/index.html` のheadに追加して配信し、確認後もタグを残す。サイトマップに `/sitemap.xml` を登録し、「URL検査」でトップページのインデックス登録をリクエストする。サイト名やfaviconの更新時も同じ手順で再クロールを依頼する。反映時期と表示名はGoogleが決める。

公開URLを変える場合は、`web/shared/site.ts` と `assets/_headers`・`assets/robots.txt`・`assets/sitemap.xml` の本番URLを揃えて更新する。

## ライセンス

[GNU Affero General Public License v3.0 or later](LICENSE)。第三者の素材は [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) を参照。
