# Backwards compatibility — all imports from src.database still work
# The actual implementation has been split into src/db/ package.
from src.db import *  # noqa: F401,F403

# Re-export private internals used by tests (monkeypatch.setattr on this module)
from src.db.core import (  # noqa: F401
    _resolve_db_path,
    _local,
    _current_user_email,
    _shared_db_initialized,
    _user_db_initialized,
    _legacy_migration_done,
    _integrity_checked,
    _open_db,
    _check_db_integrity,
    _is_conn_alive,
    _try_recover_db,
)
