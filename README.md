# mortal-jan

麻雀AI [Mortal](https://github.com/Equim-chan/Mortal) の評価で採点する「何切る問題」Webサービス。
問題はMortal同士の自己対局から生成する。

- 仕様: [docs/spec/プロダクト仕様.md](docs/spec/プロダクト仕様.md)
- 構成: [docs/spec/アーキテクチャ.md](docs/spec/アーキテクチャ.md)

## 問題生成（Windows）

Python 3.12・Rust（cargo）・gitが必要。生成物は `generated/` に出る。

```powershell
pwsh -File tools/mortal/setup.ps1          # Mortal環境を .mortal/ に構築
pwsh -File tools/generate-problems.ps1     # 自己対局→全判断の評価→抽出の設定の導出→問題データ
```

`generate-problems.ps1` は中断しても、再実行すれば続きから処理する。導出した抽出の設定（鳴きの閾値・鳴き枠とリーチ枠の確率）は `generator/calibration.json` に保存される。

初回実行時に、本番の問題集用の非公開の乱数seed（`generator/seeds.local.json`、git対象外）を作る。公開コードとseedがあれば問題と答えを再現できるため、このファイルは公開せず、バックアップしておく。

## Web（`web/`）

Node.js 24が必要。問題データは `.mortal/venv/Scripts/python.exe -m generator.load` でSQL（`generated/problems.sql`）にしてから投入する。

```powershell
cd web
npm ci
npm run db:migrate:local    # ローカルD1にテーブルを作る
npm run db:load:local       # ローカルD1に問題を入れる
npm run dev                 # http://localhost:5173
npm test; npm run typecheck
```

配信はGitHub Actionsの「Deploy」ワークフローを手動で実行する（リポジトリのSecretに `CLOUDFLARE_API_TOKEN` が必要）。本番D1への問題投入は `npx wrangler d1 execute DB --remote --file ../generated/problems.sql` で行う。すでに問題が入っているDB（試験配信の問題など）を入れ替えるときは、`generator.load --replace` で作ったSQLを使う（問題・回答・成績をすべて消してから入れる。プレイヤーと名前は残る）。

## ライセンス

[GNU Affero General Public License v3.0 or later](LICENSE)。第三者の素材は [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) を参照。
