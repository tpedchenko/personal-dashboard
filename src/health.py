"""Minimal health-check HTTP server (stdlib only).

Runs on port 8001 in a daemon thread so it never blocks the main process.
Endpoint: GET /healthz → JSON with status, db check, version, timestamp.
"""

import json
import logging
import os
import sqlite3
import threading
from datetime import datetime, timezone
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path

logger = logging.getLogger(__name__)

VERSION = "1.0"
PORT = 8001

SHARED_DB_PATH = Path(__file__).parent.parent / "data" / "shared.db"


def _check_db() -> bool:
    """Check database connectivity (PostgreSQL or SQLite)."""
    try:
        from src.db_backend import is_postgres
        if is_postgres():
            from src.db_backend import get_pg_connection
            with get_pg_connection() as conn:
                conn.execute("SELECT 1")
            return True
        with sqlite3.connect(str(SHARED_DB_PATH), timeout=3) as conn:
            conn.execute("SELECT 1")
        return True
    except Exception:
        return False


class _HealthHandler(BaseHTTPRequestHandler):
    """Handle only GET /healthz; everything else → 404."""

    def do_GET(self):  # noqa: N802
        if self.path.rstrip("/") == "/healthz":
            db_ok = _check_db()
            body = {
                "status": "ok",
                "db": db_ok,
                "version": VERSION,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            status_code = 200 if db_ok else 503
            payload = json.dumps(body).encode()
            self.send_response(status_code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
        else:
            self.send_error(404)

    # Silence per-request log lines (they clutter bot output).
    def log_message(self, format, *args):  # noqa: A002
        pass


def start_health_server(port: int = PORT) -> threading.Thread:
    """Start the health-check HTTP server on a daemon thread.

    Returns the thread (already started).  Because it is a daemon thread
    it will be torn down automatically when the main process exits.
    """
    server = HTTPServer(("0.0.0.0", port), _HealthHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    logger.info("Health-check server listening on :%s", port)
    return thread


def _send_telegram_alert(message: str):
    """Send alert to owner via Telegram."""
    try:
        import urllib.request
        token = os.environ.get("TELEGRAM_BOT_TOKEN")
        chat_id = os.environ.get("TELEGRAM_TARAS_ID")
        if not token or not chat_id:
            return
        data = json.dumps({"chat_id": int(chat_id), "text": message}).encode()
        req = urllib.request.Request(
            f"https://api.telegram.org/bot{token}/sendMessage",
            data=data,
            headers={"Content-Type": "application/json"},
        )
        urllib.request.urlopen(req, timeout=10)
    except Exception:
        pass


def start_health_monitor(check_interval: int = 300):
    """Start a background thread that checks health every N seconds and alerts on failure.

    Sends a Telegram alert when the health check fails and when it recovers.
    """
    def _monitor():
        _was_healthy = True
        _alert_sent = False
        while True:
            import time
            time.sleep(check_interval)
            db_ok = _check_db()
            if not db_ok and _was_healthy:
                _send_telegram_alert(
                    "🚨 PD Server Alert: Database check FAILED!\n"
                    f"Time: {datetime.now(timezone.utc).isoformat()}\n"
                    "The shared database is not responding."
                )
                _was_healthy = False
                _alert_sent = True
            elif db_ok and not _was_healthy:
                _send_telegram_alert(
                    "✅ PD Server: Database recovered.\n"
                    f"Time: {datetime.now(timezone.utc).isoformat()}"
                )
                _was_healthy = True
                _alert_sent = False

    thread = threading.Thread(target=_monitor, daemon=True)
    thread.start()
    logger.info("Health monitor started (check every %ds)", check_interval)
    return thread


# Allow standalone execution: python -m src.health  /  python src/health.py
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    start_health_server()
    logger.info("Health server running — press Ctrl+C to stop")
    # Block the main thread so the daemon thread keeps running.
    threading.Event().wait()
