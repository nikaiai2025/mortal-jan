次の形のJSONだけを書く（説明文やコードブロックの記号は不要）。牌は 1m〜9m・1p〜9p・1s〜9s・E S W N P F C・5mr 5pr 5sr・"不明" のどれか。読めない数値は null。
{
 "round": {"wind": "E|S|W|N|不明", "number": 1, "honba": 0, "riichiSticks": 0},
 "dealer": "self|shimocha|toimen|kamicha|不明",
 "doraIndicators": ["F"],
 "hand": {"concealed": ["1m", "2m"], "drawn": null},
 "players": {
  "self": {"score": 25000, "riichi": "true|false|不明", "river": [{"tile": "1s", "sideways": false}], "melds": [{"type": "chi|pon|daiminkan|ankan|kakan|不明", "tiles": ["N", "N", "N"], "from": "shimocha|toimen|kamicha|なし|不明"}]},
  "shimocha": {"score": 25000, "riichi": "false", "river": [], "melds": []},
  "toimen": {"score": 25000, "riichi": "false", "river": [], "melds": []},
  "kamicha": {"score": 25000, "riichi": "false", "river": [], "melds": []}
 },
 "uncertainties": []
}
self=自分（手前）、shimocha=下家（右）、toimen=対面（奥）、kamicha=上家（左）。
