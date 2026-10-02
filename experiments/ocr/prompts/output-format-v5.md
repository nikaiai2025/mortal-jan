次の形のJSONだけを書く（説明文やコードブロックの記号は不要）。牌は 1m〜9m・1p〜9p・1s〜9s・E S W N P F C・5mr 5pr 5sr・"不明" のどれか。読めない数値は null。
下の例の牌や点数は形式を示すだけの仮の値。河（river）には、画像の各プレイヤーの捨て牌を全て、捨てた順に並べる。
{
 "round": {"wind": "E", "number": 1, "honba": 0, "riichiSticks": 0},
 "dealer": "shimocha",
 "doraIndicators": ["F"],
 "hand": {"concealed": ["1m", "2m", "3m", "4p", "5p", "6p", "7s", "8s", "9s", "E", "E", "C", "C"], "drawn": "P"},
 "players": {
  "self": {"score": 25000, "riichi": "false", "riverCount": 3, "river": [{"tile": "1s", "sideways": false}, {"tile": "N", "sideways": false}, {"tile": "9m", "sideways": false}], "melds": []},
  "shimocha": {"score": 25000, "riichi": "true", "riverCount": 3, "river": [{"tile": "W", "sideways": false}, {"tile": "2p", "sideways": true}, {"tile": "8s", "sideways": false}], "melds": [{"type": "pon", "tiles": ["F", "F", "F"], "from": "toimen"}]},
  "toimen": {"score": 25000, "riichi": "false", "riverCount": 3, "river": [{"tile": "S", "sideways": false}, {"tile": "1p", "sideways": false}, {"tile": "5m", "sideways": false}], "melds": []},
  "kamicha": {"score": 25000, "riichi": "false", "riverCount": 3, "river": [{"tile": "P", "sideways": false}, {"tile": "7m", "sideways": false}, {"tile": "3s", "sideways": false}], "melds": []}
 },
 "uncertainties": []
}
self=自分（手前）、shimocha=下家（右）、toimen=対面（奥）、kamicha=上家（左）。dealer・riichi・melds の type・from は次から選ぶ:
dealer: self|shimocha|toimen|kamicha|不明、riichi: true|false|不明、type: chi|pon|daiminkan|ankan|kakan|不明、from: shimocha|toimen|kamicha|なし|不明。
