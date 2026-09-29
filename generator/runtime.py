"""Mortal runtime built by tools/mortal/setup.ps1 (problem generation only)."""

from __future__ import annotations

import hashlib
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
MORTAL_ROOT = REPO_ROOT / ".mortal"
WEIGHT_PATH = MORTAL_ROOT / "mortal_298k.pth"
GENERATED_ROOT = REPO_ROOT / "generated"

IDENTITY = {
    "model": "mortal-298k",
    "sourceCommit": "0cff2b52982be5b1163aa9a62fb01f03ce91e0d2",
    "modelSha256": "bfb3a6c072aa0bfd4171a9cdc77cb6c02ae42cde920843f9e5784394f23447d8",
}
OBS_VERSION = 4

sys.path.insert(0, str(MORTAL_ROOT / "source" / "mortal"))
sys.path.insert(0, str(MORTAL_ROOT / "libriichi"))


def load_model():
    """Return (brain, dqn) in eval mode after verifying the pinned weight."""
    import torch
    from model import Brain, DQN  # Mortal source

    digest = hashlib.sha256(WEIGHT_PATH.read_bytes()).hexdigest()
    if digest != IDENTITY["modelSha256"]:
        raise RuntimeError(f"weight SHA-256 mismatch: {digest}")
    # weights_only=True: the file is third-party pickle data.
    state = torch.load(str(WEIGHT_PATH), weights_only=True, map_location="cpu")
    config = state["config"]
    version = config["control"].get("version", 1)
    if version != OBS_VERSION:
        raise RuntimeError(f"unexpected model version: {version}")
    brain = Brain(
        version=version,
        conv_channels=config["resnet"]["conv_channels"],
        num_blocks=config["resnet"]["num_blocks"],
    ).eval()
    dqn = DQN(version=version).eval()
    brain.load_state_dict(state["mortal"])
    dqn.load_state_dict(state["current_dqn"])
    return brain, dqn
