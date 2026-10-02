# RoboMajang 3D俯瞰の卓画像ハーネス

`generated/problems.jsonl` の `problem.scene` を、RoboMajang の3D俯瞰（overhead3d）の卓canvasへ描いてPNGにする。OCRプロンプトの正解付き評価用。

## 使い方

1. RoboMajang のリポジトリで、開発サーバーを専用ポートで起動する。

   ```
   npm -w @robomajang/web run dev -- --host 127.0.0.1 --port 4179 --strictPort
   ```

2. このフォルダで実行する。

   ```
   node render.cjs 359,767,101,15
   ```

   各idについて `rm-<id>.png`（1000×1000、不透明）と `rm-<id>.truth.json`（sceneそのまま）を出力する。サーバーが無ければ終了コード2で起動コマンドを表示する。

## 画像に写るもの・写らないもの

| sceneの項目 | 画像 |
|---|---|
| `hand` / `drawn` | 手前に表向き。`drawn` は右端に隙間を空けて置く |
| `rivers`（順・`riichi`・`called`） | 6枚×3段。リーチ牌は横向き、鳴かれた牌は不透明度0.35（白は判読困難） |
| `melds` | 牌と種類は写る。横向きは常に持ち主から見て右端で、`pai` をそこへ置く。`target` は写らない |
| `concealedCounts` | 他家は伏せ牌の枚数として写る |
| `scores` / `oya` / `bakaze`+`kyoku` / `tilesLeft` / `riichi` | 中央パネル（各辺に風・点数、親は赤、局名、残り山、リーチ棒） |
| `doraMarkers` / `honba` / `kyotaku` / `tsumogiri` / `target` / 絶対の`seat` | 写らない |

## 対応づけの約束

- 手前が `seat`、右が `seat+1`（下家）、対面が `seat+2`、左が `seat+3`（上家）。
- 副露の並び（持ち主から見て左→右）: チー・ポン・明槓は `consumed` の順の後に横向きの `pai`。加槓は `consumed`、`added`、横向きの `pai` の4枚横並び（明槓と区別できない）。暗槓は両端が伏せ牌で、赤5があれば表の2枚に入れる。
- 河が19枚目以降になると、3段目を11列まで、続いて1段目・2段目を10列まで右へ伸ばす。
