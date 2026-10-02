"""Score the outputs a run already has (e.g. written by subagents) and append the summary to runs/log.md.

    python score_run.py <run name> <truth dir> "<what changed in this version>"
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from evaluate import score
from experiment import summarize

HERE = Path(__file__).parent

if __name__ == "__main__":
    run, truth_dir, note = sys.argv[1], Path(sys.argv[2]), sys.argv[3] if len(sys.argv) > 3 else ""
    folder = HERE / "runs" / run
    results, broken = [], []
    for out in sorted(folder.glob("*.json")):
        if out.name == "summary.json":
            continue
        try:
            results.append(score(out, truth_dir=truth_dir))
        except Exception as error:  # malformed output counts as a miss, not a crash
            broken.append(f"{out.name}: {type(error).__name__} {error}")
    missing = sorted({p.name.removesuffix(".truth.json") for p in truth_dir.glob("*.truth.json")} - {Path(r["file"]).stem for r in results} - {b.split(":")[0].removesuffix(".json") for b in broken})
    summary = summarize(results) | {"broken": broken, "missing": missing}
    (folder / "summary.json").write_text(json.dumps({**summary, "results": results}, ensure_ascii=False, indent=1), encoding="utf-8")
    checks = ", ".join(f"{k} {v}" for k, v in summary["checks"].items())
    line = f"| {run} | {note} | {summary['images']} | {summary['river tiles in order']} | {summary['rivers exact']} | {summary['hand tiles']} | {checks} | {len(broken)} |\n"
    log = HERE / "runs" / "log.md"
    if not log.exists():
        log.write_text("| run | 変更点 | 枚数 | 河（順番込み） | 河の完全一致 | 手牌 | 項目別 | 壊れた出力 |\n|---|---|---|---|---|---|---|---|\n", encoding="utf-8")
    # One line per run: a re-score replaces the run's earlier line.
    kept = [l for l in log.read_text(encoding="utf-8").splitlines(keepends=True) if not l.startswith(f"| {run} |")]
    log.write_text("".join(kept) + line, encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=1))
