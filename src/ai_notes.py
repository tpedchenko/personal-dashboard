"""AI Notes: generate and render per-section AI insights using Gemini."""
import os
import logging
import requests
from datetime import datetime, timedelta, timezone

_log = logging.getLogger(__name__)

GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models"
GEMINI_MODEL = "gemini-2.5-flash"

# Section-specific default prompts
_DEFAULT_PROMPTS = {
    "finance": (
        "Проаналізуй фінансові дані користувача. "
        "Дай 2-3 коротких інсайти: тренди витрат, де можна зекономити, "
        "порівняння з попереднім місяцем. Формат: markdown, коротко, по суті."
    ),
    "my_day": (
        "Проаналізуй дані настрою та енергії користувача за останній тиждень. "
        "Знайди паттерни, дай 1-2 поради для покращення самопочуття. "
        "Формат: markdown, коротко."
    ),
    "gym": (
        "Проаналізуй тренувальні дані. "
        "Дай інсайти щодо прогресу, відновлення, об'єму тренувань. "
        "Формат: markdown, коротко, 2-3 пункти."
    ),
    "dashboard": (
        "Дай загальний огляд фінансів та здоров'я. "
        "Виділи ключові метрики, тренди, рекомендації. "
        "Формат: markdown, коротко, 3-4 пункти."
    ),
}


def _get_gemini_key() -> str | None:
    """Resolve Gemini API key from env var or per-user secrets."""
    key = os.getenv("GEMINI_API_KEY")
    if key:
        return key
    try:
        from src.database import get_secret
        key = get_secret("gemini_api_key")
        if key:
            return key
    except Exception:
        pass
    return None


def generate_note(section: str, context_data: str, custom_prompt: str = "") -> str:
    """Generate AI note for a section using Gemini REST API.

    Args:
        section: Section key (e.g. 'finance', 'gym', 'dashboard')
        context_data: Text context with user's data
        custom_prompt: Optional custom prompt override

    Returns:
        Generated note text (markdown)
    """
    key = _get_gemini_key()
    if not key:
        return "_API key not configured._"

    prompt = custom_prompt or _DEFAULT_PROMPTS.get(section, "Дай короткий AI інсайт по цих даних.")

    system_instruction = (
        "Ти — AI-асистент у персональному дашборді. "
        "Відповідай українською, коротко (3-5 речень). "
        "Використовуй markdown для форматування. "
        "Будь конкретним: наводь цифри з даних, порівнюй періоди."
    )

    user_text = f"{prompt}\n\nДані:\n{context_data}"

    body = {
        "contents": [{"role": "user", "parts": [{"text": user_text}]}],
        "generationConfig": {"maxOutputTokens": 2048},
        "systemInstruction": {"parts": [{"text": system_instruction}]},
    }

    try:
        resp = requests.post(
            f"{GEMINI_API_URL}/{GEMINI_MODEL}:generateContent",
            headers={"x-goog-api-key": key},
            json=body,
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        parts = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
        return parts[0].get("text", "").strip() if parts else "_No response._"
    except Exception as e:
        _log.warning("AI note generation failed for %s: %s", section, e)
        return f"_Error generating note: {e}_"


def render_ai_note(section: str, context_fn=None):
    """Render AI note Streamlit component for a section.

    Args:
        section: Section key (e.g. 'finance', 'gym')
        context_fn: Optional callable that returns context data string.
                    Called lazily only when generating/regenerating.
    """
    import streamlit as st
    from src.database import get_ai_note, set_ai_note, get_ai_note_prompt, set_ai_note_prompt
    from src.i18n import t

    note_data = get_ai_note(section)
    has_note = note_data is not None and note_data.get("note", "").strip()

    # Container key for unique widget keys
    k = f"ai_note_{section}"

    with st.container():
        if has_note:
            # Show existing note
            st.markdown(
                f"""<div style="
                    background: rgba(99,102,241,0.08);
                    border-left: 3px solid #6366f1;
                    border-radius: 6px;
                    padding: 10px 14px;
                    margin: 8px 0;
                    font-size: 0.92em;
                    line-height: 1.5;
                "><span style="font-size:1.1em">🤖</span> {note_data['note']}</div>""",
                unsafe_allow_html=True,
            )

            col1, col2 = st.columns([1, 1])
            with col1:
                if st.button(f"🔄 {t('ai_note.regenerate')}", key=f"{k}_regen", use_container_width=True):
                    with st.spinner(t("ai_note.generating")):
                        ctx = context_fn() if context_fn else ""
                        prompt = get_ai_note_prompt(section)
                        new_note = generate_note(section, ctx, prompt)
                        set_ai_note(section, new_note, prompt)
                        st.rerun()
            with col2:
                pass  # balance layout

            with st.expander(f"✏️ {t('ai_note.edit_prompt')}"):
                current_prompt = note_data.get("prompt", "") or ""
                new_prompt = st.text_area(
                    t("ai_note.edit_prompt"),
                    value=current_prompt,
                    key=f"{k}_prompt",
                    label_visibility="collapsed",
                    height=80,
                    placeholder=_DEFAULT_PROMPTS.get(section, "Custom prompt..."),
                )
                if st.button(f"💾 {t('ai_note.save_prompt')}", key=f"{k}_save_prompt"):
                    set_ai_note_prompt(section, new_prompt)
                    st.toast("Prompt saved!")
        else:
            # No note yet — show generate button
            if st.button(f"🤖 {t('ai_note.generate')}", key=f"{k}_gen", use_container_width=True):
                with st.spinner(t("ai_note.generating")):
                    ctx = context_fn() if context_fn else ""
                    prompt = get_ai_note_prompt(section)
                    new_note = generate_note(section, ctx, prompt)
                    set_ai_note(section, new_note, prompt)
                    st.rerun()


def regenerate_all_notes(max_age_hours: float = 20.0):
    """Regenerate all existing AI notes older than max_age_hours.

    Designed to be called from nightly background jobs.
    """
    from src.database import get_all_ai_notes, set_ai_note

    notes = get_all_ai_notes()
    if not notes:
        return

    now = datetime.now(timezone.utc)

    for note in notes:
        # Skip notes without content (prompt-only stubs)
        if not note.get("note", "").strip():
            continue

        # Check age
        try:
            gen_at = datetime.fromisoformat(note["generated_at"])
            # Handle both naive and aware timestamps
            if gen_at.tzinfo is None:
                gen_at = gen_at.replace(tzinfo=timezone.utc)
            age = now - gen_at
            if age < timedelta(hours=max_age_hours):
                continue
        except (ValueError, TypeError):
            pass  # regenerate if timestamp is invalid

        section = note["section"]
        prompt = note.get("prompt", "")

        # Build context based on section
        ctx = _build_context_for_section(section)
        if not ctx:
            continue

        try:
            new_note = generate_note(section, ctx, prompt)
            if new_note and not new_note.startswith("_Error") and not new_note.startswith("_API"):
                set_ai_note(section, new_note, prompt)
                _log.info("Regenerated AI note for section: %s", section)
        except Exception as e:
            _log.warning("Failed to regenerate AI note for %s: %s", section, e)


def _build_context_for_section(section: str) -> str:
    """Build context data string for a given section (for background regeneration)."""
    try:
        if section in ("finance", "dashboard"):
            from src.database import get_all_transactions
            from src.analytics import prepare, build_data_context
            raw = get_all_transactions()
            if raw:
                import pandas as pd
                df = prepare(pd.DataFrame(raw))
                return build_data_context(df)
            return ""

        if section == "my_day":
            from src.database import get_all_daily_logs
            logs = get_all_daily_logs()
            if logs:
                recent = logs[-7:]  # last 7 entries
                lines = ["Last 7 daily log entries:"]
                for log in recent:
                    parts = [f"Date: {log.get('date', '?')}"]
                    if log.get("level") is not None:
                        parts.append(f"Level: {log['level']}")
                    if log.get("mood_delta") is not None:
                        parts.append(f"Mood: {log['mood_delta']}")
                    if log.get("energy_level"):
                        parts.append(f"Energy: {log['energy_level']}")
                    if log.get("stress_level"):
                        parts.append(f"Stress: {log['stress_level']}")
                    if log.get("general_note"):
                        parts.append(f"Note: {log['general_note']}")
                    lines.append("  " + ", ".join(parts))
                return "\n".join(lines)
            return ""

        if section == "gym":
            from src.analytics import build_gym_context
            ctx = build_gym_context()
            return ctx if ctx else ""

    except Exception as e:
        _log.warning("Failed to build context for %s: %s", section, e)
    return ""
