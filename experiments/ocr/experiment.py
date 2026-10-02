"""Run one prompt over a set of images with known truth and summarize accuracy.

    python experiment.py <run name> <prompt.md> <model> <image>...
Outputs go to runs/<run name>/<image stem>.json; the summary to runs/<run name>/summary.json.
Images whose truth is a RoboMajang render (rm-*) are not scored on what the render does not draw
(dora indicators, honba, deposits).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import ocr
from evaluate import score

HERE = Path(__file__).parent


def summarize(results: list[dict]) -> dict:
    def ratio(key: str) -> str:
        hit = sum(int(r[key].split("/")[0]) for r in results)
        total = sum(int(r[key].split("/")[1]) for r in results)
        return f"{hit}/{total} ({hit / total:.0%})" if total else "-"

    checks = {}
    for r in results:
        for name, ok in r["checks"].items():
            if ok is None:
                continue
            good, seen = checks.get(name, (0, 0))
            checks[name] = (good + bool(ok), seen + 1)
    return {
        "images": len(results),
        "river tiles in order": ratio("river tiles in order"),
        "rivers exact": ratio("rivers exact"),
        "hand tiles": ratio("hand tiles"),
        "checks": {name: f"{good}/{seen}" for name, (good, seen) in checks.items()},
    }


if __name__ == "__main__":
    run, prompt, model, *images = sys.argv[1:]
    folder = HERE / "runs" / run
    folder.mkdir(parents=True, exist_ok=True)
    results = []
    for image in map(Path, images):
        out = folder / f"{image.stem}.json"
        if not out.exists():
            try:
                result = ocr.read(model, image, Path(prompt))
            except RuntimeError as error:  # an image without an answer is left out of the summary, not the whole run
                print(f"{image.name}: {error}", file=sys.stderr)
                continue
            out.write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
            print(f"{image.name}: {result['seconds']}s", file=sys.stderr)
        results.append(score(out, truth_dir=image.parent))
    summary = summarize(results)
    (folder / "summary.json").write_text(json.dumps({"prompt": prompt, "model": model, **summary, "results": results}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=1))
