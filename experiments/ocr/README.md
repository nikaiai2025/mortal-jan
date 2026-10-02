# OCR実験

盤面画像をGeminiで構造化JSONに読み、正解と照合する実験。結果と結論は [docs/research/OCR試行.md](../../docs/research/OCR試行.md)。製品のコードではない。

## 準備
- Python（Pillow）。APIキーは環境変数 `GEMINI_API_KEY`、またはカンマ区切りの `GEMINI_API_KEYS`。
- 画像を描くスクリプト（`*.cjs`）は Node と Playwright を使う。Playwright はこのリポジトリの依存にないので、インストール済みのものを `PLAYWRIGHT_MODULE` で指定する。Chromeを使うなら `CHROME_PATH`。

## 実行
1版を画像群で読み、採点して `runs/<run>/` に書く:

```
OCR_RIVER_ROWS=1 OCR_PART_RESOLUTION=MEDIA_RESOLUTION_ULTRA_HIGH OCR_CODE_EXECUTION=1 python experiment.py g35-v21 prompts/prompt-v21.md gemini-3.5-flash robomajang/rm-*.png
python score_run.py g35-v21 robomajang "v21: ..."    # runs/log.md に1行で記録
python rivers.py g35-v21                             # 河の失敗を席・種類別に分ける
```

出力が既にある画像は読み直さないので、止まっても続きから回せる。

| 環境変数 | 意味 |
|---|---|
| `OCR_RIVER_ROWS=1` | 河を画面で見たままの段（`riverRows`）で書かせ、`evaluate.py` が捨てた順に並べ替える |
| `OCR_PART_RESOLUTION` | 画像ごとの解像度（例 `MEDIA_RESOLUTION_ULTRA_HIGH`） |
| `OCR_CODE_EXECUTION=1` | コード実行の道具を有効にする |
| `OCR_EXAMPLE` / `OCR_VERIFY` | 正解例を添える（`examples/example`）／2回目の要求で見直させる |
| `OCR_KEY_INDEX` | `GEMINI_API_KEYS` の何番目から使うか。1日の上限に達したら次のキーへ進む |

## 構成
- `ocr.py`（要求とスキーマ）、`evaluate.py`（採点）、`experiment.py`、`score_run.py`、分析用の `rivers.py`・`misreads.py`・`compare.py`・`peek.py`
- `prompts/`: 指示文の各版。`runs/log.md` の版名と対応する
- `robomajang/`: 正解付きの盤面画像（`rm-*.png`）と描画スクリプト（手順は同フォルダのREADME）
- `tiles/`: 牌だけを並べた画像での切り分け（`python sheets.py make` → `node render_sheets.cjs` → `python sheets.py pad` → `python sheets.py read <model> <run>`）。画像は再生成するのでコミットしない
- `scene-*`・`crops.py`・`capture.cjs`: 初期の、自前の2D盤面での試行
- `runs/haiku-*`: Claude Haiku のサブエージェントに読ませた結果（スクリプトなし）
