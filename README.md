# mortal-jan

麻雀AI [Mortal](https://github.com/Equim-chan/Mortal) の評価で採点する「何切る問題」Webサービス。
問題はMortal同士の自己対局から生成する。

- 仕様: [docs/spec/プロダクト仕様.md](docs/spec/プロダクト仕様.md)
- 構成: [docs/spec/アーキテクチャ.md](docs/spec/アーキテクチャ.md)

## 問題生成（Windows）

Python 3.12・Rust（cargo）・gitが必要。生成物は `generated/` に出る。

```powershell
pwsh -File tools/mortal/setup.ps1                         # Mortal環境を .mortal/ に構築
$py = ".mortal/venv/Scripts/python.exe"
& $py -m generator.selfplay --count 1100                  # 自己対局（1seed1半荘）
& $py -m generator.evaluate                               # 全判断のQ値
& $py -m generator.calibrate                              # 鳴きの閾値・リーチ重みの導出
& $py -m generator.extract --count 10000                  # 問題データ
& $py -m pytest generator/tests
```

各段は中断しても、再実行すれば続きから処理する。

## ライセンス

[GNU Affero General Public License v3.0 or later](LICENSE)。第三者の素材は [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) を参照。
