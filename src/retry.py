"""Unified retry with exponential backoff for API calls."""
import asyncio
import time
import logging
from functools import wraps
from typing import Callable

_log = logging.getLogger(__name__)

DEFAULT_RETRIES = 3
DEFAULT_BACKOFF = [1, 3, 7]  # seconds


def retry_request(func: Callable, *args, retries: int = DEFAULT_RETRIES,
                  backoff: list[int] = DEFAULT_BACKOFF, **kwargs):
    """Execute func with exponential backoff retries.

    Used by AI client, Garmin sync, Withings sync, Monobank sync.
    """
    last_exc = None
    for attempt in range(retries):
        try:
            return func(*args, **kwargs)
        except Exception as e:
            last_exc = e
            if attempt < retries - 1:
                wait = backoff[min(attempt, len(backoff) - 1)]
                _log.warning("%s attempt %d/%d failed: %s. Retrying in %ds...",
                             func.__name__ if hasattr(func, '__name__') else 'call',
                             attempt + 1, retries, e, wait)
                time.sleep(wait)
    raise last_exc


def with_retry(retries: int = DEFAULT_RETRIES, backoff: list[int] = DEFAULT_BACKOFF):
    """Decorator: retry a function with exponential backoff."""
    def decorator(func: Callable):
        @wraps(func)
        def wrapper(*args, **kwargs):
            return retry_request(func, *args, retries=retries, backoff=backoff, **kwargs)
        return wrapper
    return decorator


# ─── Circuit breaker for Telegram bot message sending ────────────────────────

# Module-level state: consecutive failure counter and cooldown timestamp
_tg_consecutive_failures: int = 0
_tg_circuit_open_until: float = 0.0  # time.monotonic() when circuit can close

CIRCUIT_BREAKER_THRESHOLD = 5   # open circuit after N consecutive failures
CIRCUIT_BREAKER_COOLDOWN = 60   # seconds to wait before retrying after circuit opens
TG_MAX_RETRIES = 5
TG_BACKOFF = [1, 2, 4, 8, 16]  # exponential backoff seconds


def _is_circuit_open() -> bool:
    """Check if the circuit breaker is currently open (blocking sends)."""
    if _tg_consecutive_failures < CIRCUIT_BREAKER_THRESHOLD:
        return False
    return time.monotonic() < _tg_circuit_open_until


def _record_tg_success():
    """Reset failure counter on successful send."""
    global _tg_consecutive_failures
    _tg_consecutive_failures = 0


def _record_tg_failure():
    """Increment failure counter; open circuit if threshold reached."""
    global _tg_consecutive_failures, _tg_circuit_open_until
    _tg_consecutive_failures += 1
    if _tg_consecutive_failures >= CIRCUIT_BREAKER_THRESHOLD:
        _tg_circuit_open_until = time.monotonic() + CIRCUIT_BREAKER_COOLDOWN
        _log.warning(
            "Telegram circuit breaker OPEN after %d consecutive failures. "
            "Cooldown %ds.", _tg_consecutive_failures, CIRCUIT_BREAKER_COOLDOWN,
        )


async def tg_send_with_retry(coro_func, *args, **kwargs):
    """Send a Telegram message with exponential backoff and circuit breaker.

    Usage:
        await tg_send_with_retry(context.bot.send_message,
                                 chat_id=user_id, text="Hello")

    Instead of:
        await context.bot.send_message(chat_id=user_id, text="Hello")

    Returns the result of the coroutine on success, or None if circuit is open
    or all retries are exhausted.
    """
    if _is_circuit_open():
        remaining = _tg_circuit_open_until - time.monotonic()
        _log.warning(
            "Telegram circuit breaker is OPEN. Skipping send. "
            "Retry in %.0fs.", max(remaining, 0),
        )
        return None

    last_exc = None
    for attempt in range(TG_MAX_RETRIES):
        try:
            result = await coro_func(*args, **kwargs)
            _record_tg_success()
            return result
        except Exception as e:
            last_exc = e
            _record_tg_failure()
            if _is_circuit_open():
                _log.error(
                    "Telegram send failed (attempt %d/%d): %s. Circuit breaker opened.",
                    attempt + 1, TG_MAX_RETRIES, e,
                )
                return None
            if attempt < TG_MAX_RETRIES - 1:
                wait = TG_BACKOFF[min(attempt, len(TG_BACKOFF) - 1)]
                _log.warning(
                    "Telegram send failed (attempt %d/%d): %s. Retrying in %ds...",
                    attempt + 1, TG_MAX_RETRIES, e, wait,
                )
                await asyncio.sleep(wait)

    _log.error("Telegram send failed after %d attempts: %s", TG_MAX_RETRIES, last_exc)
    return None
