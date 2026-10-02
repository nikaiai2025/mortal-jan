次の形のJSONだけを書く（説明文やコードブロックの記号は不要）。牌は 1m〜9m・1p〜9p・1s〜9s・E S W N P F C・5mr 5pr 5sr・"不明" のどれか。
下の例の牌は形式を示すだけの仮の値。river には、画像の各プレイヤーの捨て牌を全て、捨てた順に並べる。
{
 "players": {
  "self": {"river": [{"tile": "1s", "sideways": false}, {"tile": "N", "sideways": false}, {"tile": "9m", "sideways": false}]},
  "shimocha": {"river": [{"tile": "W", "sideways": false}, {"tile": "2p", "sideways": true}, {"tile": "8s", "sideways": false}]},
  "toimen": {"river": [{"tile": "S", "sideways": false}, {"tile": "1p", "sideways": false}, {"tile": "5m", "sideways": false}]},
  "kamicha": {"river": [{"tile": "P", "sideways": false}, {"tile": "7m", "sideways": false}, {"tile": "3s", "sideways": false}]}
 },
 "uncertainties": []
}
self=自分（手前）、shimocha=下家（右）、toimen=対面（奥）、kamicha=上家（左）。
