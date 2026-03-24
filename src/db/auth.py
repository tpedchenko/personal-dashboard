"""User management, authentication, secrets, sessions, guest invites, telegram links, audit log."""

import base64
import logging
import os

from .core import (
    get_conn, get_shared_conn, get_current_user_email, set_current_user,
    _user_db_dir,
    CREATE_SECRETS_SQL,
)

_log = logging.getLogger(__name__)

# ─── Secrets encryption ──────────────────────────────────────────────────────
# Opt-in: set SECRETS_ENCRYPTION_KEY env var (32-byte base64-encoded key).
# Generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# When enabled, new secrets are encrypted; reads try decrypt first, fallback to plaintext (migration).

_ENCRYPTION_KEY = os.environ.get("SECRETS_ENCRYPTION_KEY")
_fernet = None
if _ENCRYPTION_KEY:
    try:
        from cryptography.fernet import Fernet, InvalidToken  # noqa: F401
        _fernet = Fernet(_ENCRYPTION_KEY.encode() if isinstance(_ENCRYPTION_KEY, str) else _ENCRYPTION_KEY)
    except Exception as e:
        _log.warning("SECRETS_ENCRYPTION_KEY set but invalid, secrets will NOT be encrypted: %s", e)


def _encrypt_value(plaintext: str) -> str:
    if _fernet is None:
        return plaintext
    return _fernet.encrypt(plaintext.encode()).decode()


def _decrypt_value(stored: str) -> str:
    if _fernet is None:
        return stored
    try:
        return _fernet.decrypt(stored.encode()).decode()
    except Exception:
        # Plaintext value not yet migrated — return as-is
        return stored


# ─── Secrets ──────────────────────────────────────────────────────────────────

_secret_cache: dict[str, str | None] = {}


def _clear_secret_cache():
    """Clear the in-memory secret cache."""
    _secret_cache.clear()


def get_secret(key: str) -> str | None:
    """Get secret from DB. Results are cached in memory for the duration of a Streamlit rerun."""
    email = get_current_user_email()
    cache_key = f"{email or ''}:{key}"
    if cache_key in _secret_cache:
        return _secret_cache[cache_key]

    with get_conn() as conn:
        conn.execute(CREATE_SECRETS_SQL)
        row = conn.execute("SELECT value FROM secrets WHERE key=?", (key,)).fetchone()
    result = _decrypt_value(row[0]) if row else None
    _secret_cache[cache_key] = result
    return result


def get_secrets(*keys: str) -> dict[str, str | None]:
    """Batch get multiple secrets at once. Returns dict {key: value}.

    More efficient than calling get_secret() multiple times — single DB query.
    """
    if not keys:
        return {}
    email = get_current_user_email()
    result = {}
    uncached = []
    for key in keys:
        cache_key = f"{email or ''}:{key}"
        if cache_key in _secret_cache:
            result[key] = _secret_cache[cache_key]
        else:
            uncached.append(key)

    if uncached:
        placeholders = ",".join("?" * len(uncached))
        with get_conn() as conn:
            conn.execute(CREATE_SECRETS_SQL)
            rows = conn.execute(
                f"SELECT key, value FROM secrets WHERE key IN ({placeholders})",
                tuple(uncached),
            ).fetchall()
        found = {r[0]: _decrypt_value(r[1]) for r in rows}
        for key in uncached:
            val = found.get(key)
            cache_key_s = f"{email or ''}:{key}"
            _secret_cache[cache_key_s] = val
            result[key] = val

    return result


def set_secret(key: str, value: str):
    """Set secret in DB (encrypted if SECRETS_ENCRYPTION_KEY is configured)."""
    # Invalidate cache
    email = get_current_user_email()
    # Ensure user context is set — secrets require user_id for per-user isolation
    if not email:
        import streamlit as st
        email = st.session_state.get("user", {}).get("email")
        if email:
            set_current_user(email)
    cache_key = f"{email or ''}:{key}"
    _secret_cache.pop(cache_key, None)
    encrypted = _encrypt_value(value)
    with get_conn() as conn:
        conn.execute(CREATE_SECRETS_SQL)
        conn.execute(
            "INSERT OR REPLACE INTO secrets (key, value) VALUES (?,?)", (key, encrypted)
        )



# ─── Users & Guest Invites ───────────────────────────────────────────

def get_user(email: str) -> dict | None:
    with get_shared_conn() as conn:
        row = conn.execute(
            "SELECT email, name, role, created_at FROM users WHERE email = ?", (email,)
        ).fetchone()
    if row is None:
        return None
    return {"email": row[0], "name": row[1], "role": row[2], "created_at": row[3]}


def upsert_user(email: str, name: str, role: str = "owner"):
    with get_shared_conn() as conn:
        conn.execute(
            "INSERT INTO users (email, name, role) VALUES (?, ?, ?) "
            "ON CONFLICT(email) DO UPDATE SET name = excluded.name",
            (email, name, role),
        )



def has_any_users() -> bool:
    """Check if at least one user exists (efficient — no full table scan)."""
    with get_shared_conn() as conn:
        row = conn.execute("SELECT 1 FROM users LIMIT 1").fetchone()
    return row is not None


def get_all_users() -> list[dict]:
    with get_shared_conn() as conn:
        rows = conn.execute("SELECT email, name, role, created_at FROM users ORDER BY created_at").fetchall()
    return [{"email": r[0], "name": r[1], "role": r[2], "created_at": r[3]} for r in rows]


def add_guest_invite(email: str, invited_by: str):
    # Write to shared DB first (authoritative for auth), then per-user DB
    # Note: these are separate DBs so true atomicity isn't possible,
    # but shared DB (auth) is the critical one — do it first.
    with get_shared_conn() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO guest_invites (email, invited_by) VALUES (?, ?)",
            (email, invited_by),
        )
        conn.execute(
            "INSERT INTO users (email, name, role) VALUES (?, ?, 'guest') "
            "ON CONFLICT(email) DO UPDATE SET role = 'guest'",
            (email, email),
        )
    # Store invite in per-user DB (secondary — for UI display)
    try:
        with get_conn() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO guest_invites (email, invited_by) VALUES (?, ?)",
                (email, invited_by),
            )
    except Exception:
        import logging
        logging.getLogger(__name__).warning("Failed to write guest invite to per-user DB for %s", email)


def remove_guest_invite(email: str):
    # Remove from per-user DB (primary)
    with get_conn() as conn:
        conn.execute("DELETE FROM guest_invites WHERE email = ?", (email,))
    # Also remove from shared DB
    with get_shared_conn() as conn:
        conn.execute("DELETE FROM guest_invites WHERE email = ?", (email,))
        conn.execute("DELETE FROM users WHERE email = ? AND role = 'guest'", (email,))


def get_guest_invites(invited_by: str | None = None) -> list[dict]:
    # Read from per-user DB first
    try:
        with get_conn() as conn:
            if invited_by:
                rows = conn.execute(
                    "SELECT email, invited_by, created_at FROM guest_invites WHERE invited_by = ? ORDER BY created_at",
                    (invited_by,),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT email, invited_by, created_at FROM guest_invites ORDER BY created_at"
                ).fetchall()
            if rows:
                return [{"email": r[0], "invited_by": r[1], "created_at": r[2]} for r in rows]
    except Exception:
        pass
    # Fall back to shared DB for backward compatibility
    with get_shared_conn() as conn:
        if invited_by:
            rows = conn.execute(
                "SELECT email, invited_by, created_at FROM guest_invites WHERE invited_by = ? ORDER BY created_at",
                (invited_by,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT email, invited_by, created_at FROM guest_invites ORDER BY created_at"
            ).fetchall()
    return [{"email": r[0], "invited_by": r[1], "created_at": r[2]} for r in rows]


def is_authorized_email(email: str) -> bool:
    """Check if email is an owner or an invited guest."""
    user = get_user(email)
    return user is not None


def get_user_role(email: str) -> str | None:
    """Return 'owner' or 'guest', or None if not authorized."""
    user = get_user(email)
    return user["role"] if user else None


def update_user_role(email: str, role: str):
    """Update a user's role (owner/user/guest)."""
    with get_shared_conn() as conn:
        conn.execute("UPDATE users SET role = ? WHERE email = ?", (role, email))


def delete_user(email: str):
    """Remove user from shared DB and delete their per-user database."""
    import shutil
    with get_shared_conn() as conn:
        conn.execute("DELETE FROM users WHERE email = ?", (email,))
        conn.execute("DELETE FROM guest_invites WHERE email = ?", (email,))
    # Remove telegram link
    try:
        with get_shared_conn() as conn:
            conn.execute("DELETE FROM telegram_links WHERE user_email = ?", (email,))
    except Exception:
        pass
    # Delete per-user DB directory
    user_dir = _user_db_dir(email)
    if user_dir.exists():
        shutil.rmtree(user_dir, ignore_errors=True)


# ─── Telegram Links (shared DB) ─────────────────────────────────────────────

def save_telegram_link(telegram_id: int, user_email: str, telegram_username: str = ""):
    """Link a Telegram user ID to an app email."""
    with get_shared_conn() as conn:
        conn.execute(
            "INSERT INTO telegram_links (telegram_id, user_email, telegram_username) "
            "VALUES (?, ?, ?) ON CONFLICT(telegram_id) DO UPDATE SET "
            "user_email = excluded.user_email, telegram_username = excluded.telegram_username",
            (telegram_id, user_email, telegram_username),
        )


def get_telegram_link(telegram_id: int) -> dict | None:
    """Get app user info for a Telegram ID."""
    with get_shared_conn() as conn:
        row = conn.execute(
            "SELECT telegram_id, user_email, telegram_username FROM telegram_links WHERE telegram_id = ?",
            (telegram_id,),
        ).fetchone()
    if row:
        return {"telegram_id": row[0], "user_email": row[1], "telegram_username": row[2]}
    return None


def get_telegram_links() -> list[dict]:
    """Get all telegram links."""
    with get_shared_conn() as conn:
        rows = conn.execute(
            "SELECT telegram_id, user_email, telegram_username FROM telegram_links ORDER BY user_email"
        ).fetchall()
    return [{"telegram_id": r[0], "user_email": r[1], "telegram_username": r[2]} for r in rows]


def delete_telegram_link(telegram_id: int):
    """Remove a Telegram link."""
    with get_shared_conn() as conn:
        conn.execute("DELETE FROM telegram_links WHERE telegram_id = ?", (telegram_id,))


def generate_telegram_connect_code(email: str) -> str:
    """Generate a 6-char code for linking Telegram to this email. Valid for 10 min."""
    import secrets as _secrets
    code = _secrets.token_hex(3).upper()  # 6 hex chars
    with get_shared_conn() as conn:
        conn.execute(
            "INSERT INTO telegram_connect_codes (code, user_email) VALUES (?, ?) "
            "ON CONFLICT(code) DO UPDATE SET user_email = excluded.user_email, "
            "created_at = CURRENT_TIMESTAMP",
            (code, email),
        )
    return code


def redeem_telegram_connect_code(code: str) -> str | None:
    """Redeem a connect code. Returns email if valid (< 10 min old), else None."""
    with get_shared_conn() as conn:
        row = conn.execute(
            "SELECT user_email FROM telegram_connect_codes "
            "WHERE code = ? AND created_at > datetime('now', '-10 minutes')",
            (code.upper(),),
        ).fetchone()
        if row:
            conn.execute("DELETE FROM telegram_connect_codes WHERE code = ?", (code.upper(),))
            return row[0]
    return None


# ─── Audit Log (shared DB) ──────────────────────────────────────────────────

def add_audit_log(user_email: str, action: str, details: str = ""):
    """Record an action in the audit log."""
    try:
        with get_shared_conn() as conn:
            conn.execute(
                "INSERT INTO audit_log (user_email, action, details) VALUES (?, ?, ?)",
                (user_email, action, details),
            )
    except Exception:
        pass


def get_audit_log(limit: int = 100, user_email: str | None = None) -> list[dict]:
    """Get recent audit log entries."""
    with get_shared_conn() as conn:
        if user_email:
            rows = conn.execute(
                "SELECT id, user_email, action, details, created_at FROM audit_log "
                "WHERE user_email = ? ORDER BY created_at DESC LIMIT ?",
                (user_email, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT id, user_email, action, details, created_at FROM audit_log "
                "ORDER BY created_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
    return [{"id": r[0], "user_email": r[1], "action": r[2], "details": r[3], "created_at": r[4]} for r in rows]
