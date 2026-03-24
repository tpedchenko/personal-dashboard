"""Background sync manager for Garmin, Withings, Monobank, and bunq."""
import json
import logging

from src.database import set_current_user, get_secret

_log = logging.getLogger(__name__)


def background_sync(user_email: str):
    """Auto-sync all connected integrations in a background thread.

    Must be called from a daemon thread. Sets user context via ContextVar
    before accessing per-user databases/secrets.
    """
    # Re-set user context in the new thread
    set_current_user(user_email)

    # ── Garmin ──
    try:
        _garmin_auto = get_secret("garmin_auto_sync") or "auto"
        if _garmin_auto == "auto":
            from src.garmin import sync_garmin_smart, get_garmin_daily_count
            if get_garmin_daily_count() > 0:
                sync_garmin_smart()
    except Exception as e:
        _log.warning("Garmin sync failed: %s", e)

    # ── Withings ──
    try:
        _withings_auto = get_secret("withings_auto_sync") or "auto"
        if _withings_auto == "auto":
            from src.withings import sync_withings_smart, is_connected as _wc
            if _wc():
                sync_withings_smart()
    except Exception as e:
        _log.warning("Withings sync failed: %s", e)

    # ── Monobank ──
    try:
        _mt = get_secret("monobank_token")
        _mono_auto = get_secret("monobank_auto_sync") or "auto"
        if _mt and _mono_auto == "auto":
            from src.monobank import sync_monobank
            _mappings_json = get_secret("monobank_account_mappings") or "[]"
            try:
                _mappings = json.loads(_mappings_json)
            except Exception as e:
                _log.warning("Failed to parse monobank_account_mappings JSON: %s", e)
                _mappings = []
            if not _mappings:
                _ma = get_secret("monobank_account_id")
                if _ma:
                    _mappings = [{"account_id": _ma, "account_name": get_secret("monobank_account_name") or "Mono"}]
            for _m in _mappings:
                if _m.get("account_id"):
                    sync_monobank(token=_mt, account_id=_m["account_id"], days=1,
                                  account_name=_m.get("account_name", "Mono"))
    except Exception as e:
        _log.warning("Monobank sync failed: %s", e)

    # ── bunq ──
    try:
        _bk = get_secret("bunq_api_key")
        _bunq_auto = get_secret("bunq_auto_sync") or "auto"
        if _bk and _bunq_auto == "auto":
            from src.bunq_integration import sync_bunq
            _bunq_suffix = get_secret("bunq_user_suffix") or "default"
            _bunq_map_json = get_secret("bunq_account_mappings") or "[]"
            try:
                _bunq_maps = json.loads(_bunq_map_json)
            except Exception as e:
                _log.warning("Failed to parse bunq_account_mappings JSON: %s", e)
                _bunq_maps = []
            for _bm in _bunq_maps:
                if _bm.get("account_id"):
                    sync_bunq(api_key=_bk, account_id=_bm["account_id"], days=1,
                              account_name=_bm.get("account_name", "bunq"),
                              user_suffix=_bunq_suffix)
    except Exception as e:
        _log.warning("bunq sync failed: %s", e)
