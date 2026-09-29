# mortal-jan

麻雀AI [Mortal](https://github.com/Equim-chan/Mortal) の評価で採点する「何切る問題」Webサービス。
問題はMortal同士の自己対局から生成する。

- 仕様: [docs/spec/プロダクト仕様.md](docs/spec/プロダクト仕様.md)
- 構成: [docs/spec/アーキテクチャ.md](docs/spec/アーキテクチャ.md)

## 問題生成の環境構築（Windows）

Python 3.12・Rust（cargo）・gitが必要。

```powershell
pwsh -File tools/mortal/setup.ps1
```

## ライセンス

[GNU Affero General Public License v3.0 or later](LICENSE)。第三者の素材は [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) を参照。
