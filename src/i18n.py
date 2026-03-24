"""Internationalization: EN & UA support."""
import json
from pathlib import Path

_TRANSLATIONS: dict[str, dict] = {}
_CURRENT_LANG = "uk"


def init_i18n(lang: str = "uk"):
    """Load translations for the given language. Skip if already loaded for this lang."""
    global _TRANSLATIONS, _CURRENT_LANG
    if _CURRENT_LANG == lang and _TRANSLATIONS:
        return  # already loaded
    _CURRENT_LANG = lang
    i18n_dir = Path(__file__).parent.parent / "i18n"
    path = i18n_dir / f"{lang}.json"
    if path.exists():
        _TRANSLATIONS = json.loads(path.read_text(encoding="utf-8"))
    else:
        _TRANSLATIONS = {}


def t(key: str, **kwargs) -> str:
    """Translate key with {var} interpolation. Falls back to key itself."""
    parts = key.split(".")
    val = _TRANSLATIONS
    for p in parts:
        if isinstance(val, dict):
            val = val.get(p)
        else:
            return key.format(**kwargs) if kwargs else key
    if val is None:
        return key.format(**kwargs) if kwargs else key
    if not isinstance(val, str):
        return val
    if kwargs:
        val = val.format(**kwargs)
    return val


def get_current_lang() -> str:
    """Return current language code."""
    return _CURRENT_LANG
