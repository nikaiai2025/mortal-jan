import os


def api_keys() -> list[str]:
    """GEMINI_API_KEY, or the standard keys of the comma-separated GEMINI_API_KEYS in order."""
    if os.environ.get("GEMINI_API_KEY"):
        return [os.environ["GEMINI_API_KEY"]]
    keys = [k.strip() for k in os.environ.get("GEMINI_API_KEYS", "").split(",") if k.strip().startswith("AIza")]
    if not keys:
        raise SystemExit("no Gemini API key in GEMINI_API_KEY or GEMINI_API_KEYS")
    return keys


def api_key() -> str:
    return api_keys()[0]
