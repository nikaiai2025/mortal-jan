"""Read a mahjong table image with Gemini into structured JSON.

    python ocr.py <model> <image.png>...   -> <image>.<model>.json (parsed output, usage and timing)
"""

from __future__ import annotations

import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from gemini_key import api_keys

HERE = Path(__file__).parent
UNKNOWN = "不明"
TILES = [f"{n}{s}" for s in "mps" for n in range(1, 10)] + ["E", "S", "W", "N", "P", "F", "C", "5mr", "5pr", "5sr", UNKNOWN]
# Gemini 3.8 Flash rejects the schema (as "503 high demand") when this 38-value enum is repeated in it,
# so the tile notation is only described.
TILE = {"type": "STRING", "description": "牌: " + " ".join(TILES)}
SEATS = ["self", "shimocha", "toimen", "kamicha"]  # 自分・下家・対面・上家

MELD = {
    "type": "OBJECT",
    "properties": {
        "type": {"type": "STRING", "enum": ["chi", "pon", "daiminkan", "ankan", "kakan", UNKNOWN]},
        "tiles": {"type": "ARRAY", "items": TILE},
        "from": {"type": "STRING", "enum": ["shimocha", "toimen", "kamicha", "なし", UNKNOWN], "description": "鳴いた相手（暗槓はなし）"},
    },
    "required": ["type", "tiles", "from"],
    "propertyOrdering": ["type", "tiles", "from"],
}
RIVER_TILE = {
    "type": "OBJECT",
    "properties": {"tile": TILE, "sideways": {"type": "BOOLEAN"}},
    "required": ["tile", "sideways"],
    "propertyOrdering": ["tile", "sideways"],
}
# OCR_RIVER_ROWS=1: rivers are written as rows in the order seen on screen ("riverRows"); evaluate.py puts them in discard order.
RIVER_KEY = "riverRows" if os.environ.get("OCR_RIVER_ROWS") else "river"
RIVER = {"type": "ARRAY", "items": {"type": "ARRAY", "items": RIVER_TILE}} if RIVER_KEY == "riverRows" else {"type": "ARRAY", "items": RIVER_TILE}
PLAYER = {
    "type": "OBJECT",
    "properties": {
        "score": {"type": "INTEGER", "nullable": True, "description": "点数。読めなければnull"},
        "riichi": {"type": "STRING", "enum": ["true", "false", UNKNOWN]},
        RIVER_KEY: RIVER,
        "melds": {"type": "ARRAY", "items": MELD},
    },
    "required": ["score", "riichi", RIVER_KEY, "melds"],
    "propertyOrdering": ["score", "riichi", RIVER_KEY, "melds"],
}
SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "round": {
            "type": "OBJECT",
            "properties": {
                "wind": {"type": "STRING", "enum": ["E", "S", "W", "N", UNKNOWN]},
                "number": {"type": "INTEGER", "nullable": True},
                "honba": {"type": "INTEGER", "nullable": True},
                "riichiSticks": {"type": "INTEGER", "nullable": True, "description": "供託のリーチ棒の本数"},
            },
            "required": ["wind", "number", "honba", "riichiSticks"],
            "propertyOrdering": ["wind", "number", "honba", "riichiSticks"],
        },
        "dealer": {"type": "STRING", "enum": [*SEATS, UNKNOWN]},
        "doraIndicators": {"type": "ARRAY", "items": TILE},
        "hand": {
            "type": "OBJECT",
            "properties": {"concealed": {"type": "ARRAY", "items": TILE}, "drawn": {**TILE, "nullable": True}},
            "required": ["concealed", "drawn"],
            "propertyOrdering": ["concealed", "drawn"],
        },
        "players": {"type": "OBJECT", "properties": {seat: PLAYER for seat in SEATS}, "required": SEATS, "propertyOrdering": SEATS},
        "uncertainties": {"type": "ARRAY", "items": {"type": "STRING"}},
    },
    "required": ["round", "dealer", "doraIndicators", "hand", "players", "uncertainties"],
    "propertyOrdering": ["round", "dealer", "doraIndicators", "hand", "players", "uncertainties"],
}


def image_part(path: Path) -> dict:
    return image_bytes_part(path.read_bytes())


def image_bytes_part(data: bytes) -> dict:
    """An image part. OCR_PART_RESOLUTION (e.g. MEDIA_RESOLUTION_ULTRA_HIGH) sets how many tokens the image gets: the
    image is scaled to a fixed budget whatever its size (about 1090 tokens by default, 2210 at ULTRA_HIGH)."""
    part = {"inline_data": {"mime_type": "image/png", "data": base64.b64encode(data).decode()}}
    level = os.environ.get("OCR_PART_RESOLUTION")
    return part | ({"mediaResolution": {"level": level}} if level else {})


def read(model: str, image: Path, prompt: Path = HERE / "prompts" / "prompt.md") -> dict:
    # OCR_EXAMPLE=<path without extension>: a worked example (<path>.png and its answer <path>.json) shown before the image.
    example = Path(os.environ["OCR_EXAMPLE"]) if os.environ.get("OCR_EXAMPLE") else None
    shots = (
        [{"text": "例の画像:"}, image_part(example.with_suffix(".png")), {"text": "例の画像の正解:\n" + example.with_suffix(".json").read_text(encoding="utf-8")}, {"text": "読み取る画像:"}]
        if example
        else []
    )
    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt.read_text(encoding="utf-8")}, *shots, image_part(image)]}],
        "generationConfig": {"responseMimeType": "application/json", "responseSchema": SCHEMA}
        | ({"mediaResolution": os.environ["OCR_MEDIA_RESOLUTION"]} if os.environ.get("OCR_MEDIA_RESOLUTION") else {}),
    }
    # OCR_CODE_EXECUTION=1: the model may run Python on the image (crop, zoom) and look again before answering.
    if os.environ.get("OCR_CODE_EXECUTION"):
        body["tools"] = [{"codeExecution": {}}]
    started = time.time()
    # With code execution the model sometimes stops after running code without writing the answer; ask once more.
    for attempt in (1, 2):
        response = call(model, body)
        candidate = response["candidates"][0]
        parts = candidate.get("content", {}).get("parts", [])
        text = answer_text(parts)
        if text is not None:
            break
        print(f"{model}: no answer (finishReason {candidate.get('finishReason')}), attempt {attempt}", file=sys.stderr)
    else:
        raise RuntimeError(f"no answer: finishReason {candidate.get('finishReason')}")
    result = {"model": model, "seconds": round(time.time() - started, 1), "usage": response.get("usageMetadata"), "output": json.loads(text)}
    if os.environ.get("OCR_CODE_EXECUTION"):
        result["code"] = [part["executableCode"]["code"] for part in parts if "executableCode" in part]
    # OCR_VERIFY=<prompt.md>: a second request shows the image with the first reading and asks for a corrected one.
    if os.environ.get("OCR_VERIFY"):
        check = Path(os.environ["OCR_VERIFY"]).read_text(encoding="utf-8")
        body["contents"] = [{"role": "user", "parts": [{"text": prompt.read_text(encoding="utf-8") + "\n\n" + check}, image_part(image), {"text": "最初の読み取り結果:\n" + text}]}]
        response = call(model, body)
        corrected = "".join(part.get("text", "") for part in response["candidates"][0]["content"]["parts"])
        result |= {"first": result["output"], "output": json.loads(corrected), "seconds": round(time.time() - started, 1)}
    return result


def answer_text(parts: list[dict]) -> str | None:
    """The JSON answer among the response parts: with code execution the parts also hold code, its results and
    remarks, so the last text part is taken; otherwise the text parts together."""
    texts = [part["text"] for part in parts if "text" in part and not part.get("thought")]
    if not texts:
        return None
    return texts[-1] if any("executableCode" in part for part in parts) else "".join(texts)


def generate(model: str, body: dict) -> dict:
    """The parsed JSON answer of one request."""
    response = call(model, body)
    return json.loads("".join(part.get("text", "") for part in response["candidates"][0]["content"]["parts"]))


KEYS = api_keys()
key_index = int(os.environ.get("OCR_KEY_INDEX", "0"))  # where to start, to skip keys already used up today


def call(model: str, body: dict) -> dict:
    """One request. A key whose daily free quota is used up is replaced by the next key in GEMINI_API_KEYS;
    a per-minute limit is waited out; a busy model (503) is tried a few times more."""
    global key_index
    busy = iter((60, 120, 300, 600, 900))
    while True:
        request = urllib.request.Request(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
            data=json.dumps(body).encode(),
            headers={"Content-Type": "application/json", "x-goog-api-key": KEYS[key_index]},
        )
        try:
            return json.load(urllib.request.urlopen(request, timeout=600))
        except urllib.error.HTTPError as error:
            detail = error.read().decode()
            if error.code == 429 and "PerDay" in detail:
                key_index += 1
                if key_index >= len(KEYS):
                    raise SystemExit(f"{model}: every key's daily quota is used up")
                print(f"{model}: daily quota used up, moving to key #{key_index}", file=sys.stderr)
                continue
            if error.code == 429:
                print(f"{model}: per-minute limit, waiting 60s", file=sys.stderr)
                time.sleep(60)
                continue
            wait = next(busy, None) if error.code in (500, 503) else None
            if wait:
                print(f"{model}: HTTP {error.code}, retrying in {wait}s", file=sys.stderr)
                time.sleep(wait)
                continue
            raise SystemExit(f"{model}: HTTP {error.code} {detail[:600]}")


if __name__ == "__main__":
    model, *images = sys.argv[1:]
    for path in map(Path, images):
        result = read(model, path)
        out = path.with_name(f"{path.stem}.{model}.json")
        out.write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"{path.name} {model}: {result['seconds']}s, tokens {result['usage'].get('totalTokenCount') if result['usage'] else '?'} -> {out.name}")
