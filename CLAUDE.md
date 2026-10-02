# mortal-jan

麻雀の何切る問題を出題し、Mortalの評価で採点するWebサービス。公開リポジトリ（AGPL-3.0-or-later）。

## ドキュメント
- `docs/spec/`: 人間が決めたことの正典。[プロダクト仕様](docs/spec/プロダクト仕様.md)と[アーキテクチャ](docs/spec/アーキテクチャ.md)。実装済みの細部はソースコードを正典とし、ここへ再掲しない
- `プロジェクト状況.md`: 進捗・未決事項。30～50行を維持する
- `docs/research/`: 調査・実験の記録。未決事項の判断材料で、正典ではない
- `experiments/`: 製品に入っていない実験のコードとデータ（手順は各README）

## 実装原則
- Mortalは問題生成だけで使う。WebからMortalを呼ばない
- 問題生成は対局seedと抽出乱数で再現可能にし、生成物にMortalのソースcommitと重みのSHA-256を残す
- 回答前のAPI応答に候補の評価を含めない。採点はサーバーで行う
- D1は読んだ行数で課金・制限される。一覧・ランキングは集計テーブルと索引で読み、`answers`を全件走査しない
- 公開リポジトリのため、秘密情報をコミットしない。第三者の素材・コードを追加したら`THIRD_PARTY_NOTICES.md`に出典とライセンスを記録する

## Web
- 手順はREADME。`web/dev/` は開発サーバー専用の確認ページで、ビルドに含まれない。`/dev/marks.html` で回答後の演出を再生でき、`/dev/ogp.html` を1200×630で撮影したものが `assets/og.png`（OGPカード）

## Mortal環境
- `pwsh -File tools/mortal/setup.ps1` で `.mortal/`（git対象外）にソース・重み・venv・libriichiを構築する。ローカルに重みがあれば `MORTAL_WEIGHT_SOURCE` で指定するとダウンロードを省ける
- libriichiへの変更は `tools/mortal/libriichi-selfplay.patch` に置き、setup.ps1が適用する。`.mortal/source` を直接編集したら差分をパッチへ書き戻す
- 問題生成のPythonは `.mortal/venv/Scripts/python.exe` で実行する（テスト: `-m pytest generator/tests`）
