"""Typed session state wrappers for Streamlit session_state.

Provides dataclass-based access to reduce magic string keys across the app.
"""
from dataclasses import dataclass, field


@dataclass
class FinanceState:
    page: int = 0
    editing_tx: int | None = None
    last_account: str = ""
    last_category: str = ""
    mode: str = ""


@dataclass
class GymState:
    active_workout: int | None = None
    selected_date: str | None = None
    exercises_seeded: bool = False


@dataclass
class DashboardState:
    period: str = "Today"
    custom_from: str | None = None
    custom_to: str | None = None


@dataclass
class AppState:
    finance: FinanceState = field(default_factory=FinanceState)
    gym: GymState = field(default_factory=GymState)
    dashboard: DashboardState = field(default_factory=DashboardState)
    shared_db_ready: bool = False
    synced_this_session: bool = False
    demo_daily_added: bool = False
    theme: str = "dark"
    language: str = "uk"


_STATE_KEY = "_typed_app_state"


def get_state() -> AppState:
    """Get or create the typed AppState from Streamlit session_state."""
    import streamlit as st
    if _STATE_KEY not in st.session_state:
        st.session_state[_STATE_KEY] = AppState()
    return st.session_state[_STATE_KEY]
