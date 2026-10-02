# Third-party notices

## Mortal

- Repository: <https://github.com/Equim-chan/Mortal>
- Pinned source: `0cff2b52982be5b1163aa9a62fb01f03ce91e0d2`
- License: GNU Affero General Public License 3.0 or later (AGPL-3.0-or-later)
- Used only by the offline problem generator. Not included in this repository; `tools/mortal/setup.ps1` fetches the pinned source.

## Mortal reference weight

- Model: `VoidShine/mortal-298k` (third-party weight, not an official Mortal release)
- Source: <https://huggingface.co/VoidShine/mortal-298k>
- Revision: `dbbea7e3d34f99ec43fc4834ab7f2aaaed70b6ee`
- File: `mortal_298k.pth` (130774416 bytes, SHA-256 `bfb3a6c072aa0bfd4171a9cdc77cb6c02ae42cde920843f9e5784394f23447d8`)
- Declared license: AGPL-3.0
- Not included in this repository; `tools/mortal/setup.ps1` downloads and verifies the pinned file.

## Favicon glyph (`assets/favicon.svg`)

- The hiragana も is the outline of Zen Kaku Gothic New Bold, converted to a path
- Source: Zen Kaku Gothic <https://github.com/googlefonts/zen-kakugothic> (Copyright 2022 The Zen Project Authors)
- License: SIL Open Font License 1.1

## Tile images (`assets/tiles/`)

- Source: FluffyStuff/riichi-mahjong-tiles <https://github.com/FluffyStuff/riichi-mahjong-tiles> (Regular style)
- License: Public domain (CC0)

## OCR test images (`experiments/ocr/robomajang/rm-*.png`, `experiments/ocr/examples/example.png`)

- Rendered with RoboMajang (the author's own project). The tiles are the FluffyStuff images above (CC0)
- The center panel's numbers use DotGothic16 <https://github.com/fontworks-fonts/DotGothic16> (SIL Open Font License 1.1); other text is drawn with system fonts (Yu Mincho, Segoe UI)
