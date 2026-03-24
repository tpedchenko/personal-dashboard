"""Query profiling counter (per-thread)."""

import threading

_query_counter = threading.local()


def reset_query_count():
    """Reset per-thread query counter. Call at start of page render."""
    _query_counter.count = 0


def get_query_count() -> int:
    """Get number of queries executed since last reset."""
    return getattr(_query_counter, "count", 0)


def _increment_query_count():
    _query_counter.count = getattr(_query_counter, "count", 0) + 1
