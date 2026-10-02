| run | 変更点 | 枚数 | 河（順番込み） | 河の完全一致 | 手牌 | 項目別 | 壊れた出力 |
|---|---|---|---|---|---|---|---|
| haiku-v2-rm | v2（Geminiと同じ指示文） | 9 | 1/293 (0%) | 0/36 (0%) | 36/122 (30%) | round(場・局・本場・供託) 8/9, dealer 0/9, scores 0/9, riichi 5/9, sideways 8/9, melds 3/9, hand exact 0/9 | 1 |
| haiku-v3-rm | v3: 全牌を列挙・自信がなくても最も近い牌（不明は見えない時だけ） | 10 | 18/348 (5%) | 0/40 (0%) | 53/136 (39%) | round(場・局・本場・供託) 10/10, dealer 4/10, scores 2/10, riichi 6/10, sideways 7/10, melds 3/10, hand exact 0/10 | 0 |
| haiku-v4-rm | v4: 出力のひな形の河に例の牌を入れる（v3の指示文＋） | 10 | 12/348 (3%) | 0/40 (0%) | 53/136 (39%) | round(場・局・本場・供託) 10/10, dealer 2/10, scores 0/10, riichi 8/10, sideways 8/10, melds 2/10, hand exact 0/10 | 0 |
| haiku-base5 | 基準の測り直し（v3指示文＋v4ひな形、1体で10枚） | 10 | 17/348 (5%) | 0/40 (0%) | 46/136 (34%) | round(場・局・本場・供託) 10/10, dealer 0/10, scores 0/10, riichi 8/10, sideways 8/10, melds 3/10, hand exact 0/10 | 0 |
| haiku-v5 | v5: 河の枚数を先にriverCountへ（v3＋） | 10 | 1/348 (0%) | 0/40 (0%) | 71/136 (52%) | round(場・局・本場・供託) 10/10, dealer 0/10, scores 0/10, riichi 8/10, sideways 8/10, melds 3/10, hand exact 0/10 | 0 |
| haiku-v7 | v7: 河ごとの回転の直し方（v3＋） | 10 | 3/348 (1%) | 0/40 (0%) | 75/136 (55%) | round(場・局・本場・供託) 10/10, dealer 2/10, scores 2/10, riichi 8/10, sideways 8/10, melds 0/10, hand exact 0/10 | 0 |
| haiku-v6 | v6: 画面の配置（パネル・河・手牌の位置）を説明（v3＋） | 10 | 11/348 (3%) | 0/40 (0%) | 69/136 (51%) | round(場・局・本場・供託) 10/10, dealer 3/10, scores 1/10, riichi 8/10, sideways 8/10, melds 0/10, hand exact 0/10 | 0 |
| haiku-v10 | v10: 河だけを読ませる（v3の河の部分のみ） | 10 | 23/348 (7%) | 0/40 (0%) | 0/136 (0%) | round(場・局・本場・供託) 0/10, dealer 0/10, scores 0/10, riichi 0/10, sideways 8/10, melds 3/10, hand exact 0/10 | 0 |
| haiku-v8 | v8: 正解つきの例を1枚見せる（v3＋、rm-359は例なので除外） | 9 | 28/337 (8%) | 0/36 (0%) | 61/125 (49%) | round(場・局・本場・供託) 9/9, dealer 1/9, scores 2/9, riichi 7/9, sideways 7/9, melds 0/9, hand exact 0/9 | 0 |
| haiku-v9 | v9: 見たままの名前をseenに書いてから記号へ（v3＋） | 10 | 0/348 (0%) | 0/40 (0%) | 70/136 (51%) | round(場・局・本場・供託) 10/10, dealer 2/10, scores 0/10, riichi 8/10, sideways 8/10, melds 3/10, hand exact 0/10 | 0 |
| g35-v3 | Gemini 3.5 Flash 基準: v3 | 10 | 159/348 (46%) | 4/40 (10%) | 106/136 (78%) | round(場・局・本場・供託) 10/10, dealer 9/10, scores 10/10, riichi 7/10, sideways 7/10, melds 4/10, hand exact 1/10 | 0 |
| g35-v3b | Gemini 3.5 Flash 基準の再測定: v3 | 10 | 141/348 (41%) | 5/40 (12%) | 91/136 (67%) | round(場・局・本場・供託) 10/10, dealer 9/10, scores 10/10, riichi 6/10, sideways 6/10, melds 4/10, hand exact 0/10 | 0 |
| g35-v11 | v11: 各河の1枚目の位置を明示（v3＋） | 10 | 143/348 (41%) | 6/40 (15%) | 98/136 (72%) | round(場・局・本場・供託) 10/10, dealer 8/10, scores 9/10, riichi 9/10, sideways 8/10, melds 4/10, hand exact 0/10 | 0 |
| g35-v7 | v7: 河ごとの回転の直し方（v3＋） | 10 | 144/348 (41%) | 5/40 (12%) | 101/136 (74%) | round(場・局・本場・供託) 10/10, dealer 9/10, scores 10/10, riichi 8/10, sideways 8/10, melds 5/10, hand exact 0/10 | 0 |
| g35-v8 | v8: 正解つきの例を1枚添える（v3＋、rm-359は除外） | 9 | 134/337 (40%) | 5/36 (14%) | 96/125 (77%) | round(場・局・本場・供託) 9/9, dealer 8/9, scores 9/9, riichi 8/9, sideways 7/9, melds 3/9, hand exact 2/9 | 0 |
| g35-v14 | v14: 河を画面で見たままの段ごとに書かせ、並べ替えはプログラム（v3＋） | 10 | 179/348 (51%) | 7/40 (18%) | 103/136 (76%) | round(場・局・本場・供託) 10/10, dealer 9/10, scores 10/10, riichi 8/10, sideways 8/10, melds 4/10, hand exact 1/10 | 0 |
| g35-v14b | v14: 河を画面で見たままの段ごとに書かせ、並べ替えはプログラム（v3＋） | 10 | 176/348 (51%) | 4/40 (10%) | 100/136 (74%) | round(場・局・本場・供託) 10/10, dealer 9/10, scores 10/10, riichi 9/10, sideways 8/10, melds 4/10, hand exact 0/10 | 0 |
| g35-v15 | v15: 索子・筒子の模様の並びを説明（v14＋） | 10 | 183/348 (53%) | 7/40 (18%) | 98/136 (72%) | round(場・局・本場・供託) 10/10, dealer 9/10, scores 10/10, riichi 8/10, sideways 8/10, melds 4/10, hand exact 0/10 | 0 |
| g35-v16 | v16: 画像を高解像度で渡す（v14の指示文、mediaResolution HIGH） | 10 | 179/348 (51%) | 6/40 (15%) | 106/136 (78%) | round(場・局・本場・供託) 10/10, dealer 10/10, scores 10/10, riichi 8/10, sideways 7/10, melds 4/10, hand exact 1/10 | 0 |
| g35-v17 | v17: 各段の枚数（6枚）を明示（v14＋） | 10 | 177/348 (51%) | 6/40 (15%) | 103/136 (76%) | round(場・局・本場・供託) 10/10, dealer 7/10, scores 10/10, riichi 7/10, sideways 7/10, melds 5/10, hand exact 1/10 | 0 |
| g35-v18 | v18: 赤い竹・円も数える（v14＋） | 10 | 172/348 (49%) | 7/40 (18%) | 100/136 (74%) | round(場・局・本場・供託) 10/10, dealer 9/10, scores 10/10, riichi 8/10, sideways 8/10, melds 4/10, hand exact 0/10 | 0 |
| g35-v18b | v18: 赤い竹・円も数える（v14＋） | 10 | 183/348 (53%) | 6/40 (15%) | 102/136 (75%) | round(場・局・本場・供託) 10/10, dealer 7/10, scores 10/10, riichi 8/10, sideways 8/10, melds 4/10, hand exact 1/10 | 0 |
| g35-v19 | v19: 2回目の要求で1回目の結果を画像と照合して直させる（v18＋） | 10 | 183/348 (53%) | 8/40 (20%) | 100/136 (74%) | round(場・局・本場・供託) 10/10, dealer 10/10, scores 10/10, riichi 7/10, sideways 7/10, melds 4/10, hand exact 1/10 | 0 |
| g35-v19b | v19: 2回目の要求で1回目の結果を画像と照合して直させる（v18＋） | 10 | 179/348 (51%) | 7/40 (18%) | 105/136 (77%) | round(場・局・本場・供託) 10/10, dealer 8/10, scores 10/10, riichi 6/10, sideways 6/10, melds 4/10, hand exact 1/10 | 0 |
| g35-v19-first | v19の1回目だけ（=v18） | 10 | 182/348 (52%) | 8/40 (20%) | 101/136 (74%) | round(場・局・本場・供託) 10/10, dealer 8/10, scores 9/10, riichi 7/10, sideways 7/10, melds 4/10, hand exact 1/10 | 0 |
| g35-v19b-first | v19の1回目だけ（=v18） | 10 | 173/348 (50%) | 7/40 (18%) | 108/136 (79%) | round(場・局・本場・供託) 10/10, dealer 9/10, scores 10/10, riichi 6/10, sideways 6/10, melds 4/10, hand exact 1/10 | 0 |
| g35-v20 | v20: 画像を最高解像度（ULTRA_HIGH、2210トークン）で渡す（v14の指示文） | 10 | 204/348 (59%) | 8/40 (20%) | 108/136 (79%) | round(場・局・本場・供託) 10/10, dealer 8/10, scores 10/10, riichi 9/10, sideways 8/10, melds 4/10, hand exact 1/10 | 0 |
| g35-v20b | v20: 画像を最高解像度（ULTRA_HIGH、2210トークン）で渡す（v14の指示文） | 10 | 199/348 (57%) | 12/40 (30%) | 107/136 (79%) | round(場・局・本場・供託) 10/10, dealer 9/10, scores 10/10, riichi 8/10, sideways 8/10, melds 4/10, hand exact 1/10 | 0 |
| g35-v21 | v21: コード実行で河を切り出し拡大して読む（v14＋ULTRA_HIGH＋1行、7枚） | 7 | 194/256 (76%) | 10/28 (36%) | 86/95 (91%) | round(場・局・本場・供託) 7/7, dealer 5/7, scores 7/7, riichi 4/7, sideways 4/7, melds 4/7, hand exact 3/7 | 0 |
