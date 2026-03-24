"""AI chat and insights for the Streamlit dashboard — powered by Gemini REST API."""
import os
import json
from typing import Generator
import requests

from src.database import get_db_schema, execute_readonly_query

GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models"
GEMINI_MODEL = "gemini-2.5-flash"

SYSTEM_PROMPT = """You are a personal financial and lifestyle analyst. You have DIRECT READ-ONLY access to a SQLite database.

DATABASE SCHEMA:
{db_schema}

KEY TABLES AND USEFUL QUERIES:

1. **transactions** — all income/expense records
   - Columns: date, type (INCOME/EXPENSE), account, category, subcategory, amount_eur, amount_original, currency, note
   - Example: SELECT category, SUM(amount_eur) FROM transactions WHERE type='EXPENSE' AND date >= '2025-01-01' GROUP BY category ORDER BY 2 DESC

2. **daily_log** — daily mood, energy, stress, notes
   - Columns: date, mood (1-5), energy (1-5), stress (1-5), notes, user_email
   - Example: SELECT date, mood, energy, stress FROM daily_log ORDER BY date DESC LIMIT 30

3. **gym_workouts** — workout sessions
   - Columns: id, date, start_time, end_time, workout_type (Push/Pull/Legs/Full Body), notes
   - Related: gym_exercises (workout_id, exercise_name, order_num), gym_sets (exercise_id, set_number, reps, weight, intensity)

4. **garmin_daily** — Garmin health metrics
   - Columns: date, steps, total_distance_m, resting_hr, avg_stress, body_battery_high, body_battery_low, sleep_seconds, training_readiness_score
   - Example: SELECT date, steps, resting_hr, body_battery_high FROM garmin_daily ORDER BY date DESC LIMIT 14

5. **garmin_activities** — Garmin activities (running, cycling, etc.)
   - Columns: activity_id, date, activity_type, distance_m, duration_s, avg_hr, calories

6. **food_log** — food intake with macros
   - Columns: date, meal_type, description, calories, protein, carbs, fat

7. **shopping_items** — shopping list
   - Columns: name, quantity, bought (0/1), category

8. **budgets** — monthly budget limits per category
9. **savings_goals** — savings targets
10. **recurring_transactions** — auto-added recurring items
11. **ai_context_snapshots** — pre-computed monthly/weekly/yearly summaries
   - Columns: period_type ('month'/'week'/'year'), period_key ('2025-03'/'2026-W10'/'2025'), domain, content
   - Use for historical queries: SELECT content FROM ai_context_snapshots WHERE period_key = '2025-03'
   - Faster and more accurate than complex SQL on raw data for historical comparisons

You can analyze any data by writing SQL queries. The query results are provided below when available.

Your tasks:
1. Answer questions about finances, health, gym, lifestyle using real data from the DB
2. Find trends, anomalies, insights across ALL data (finances + health + gym + nutrition)
3. Give practical recommendations
4. Correlate data across domains (e.g., spending vs mood, training vs sleep quality)
5. NEVER show SQL queries to the user. Present only the final answer/analysis based on query results. The user should not see any SQL code or technical details about how data was retrieved.
6. When you need to change filters or chart views, return a JSON command in this format:

<filter_command>
{{
  "years": [2024, 2025],
  "months": null,
  "chart_focus": "category_breakdown"
}}
</filter_command>

Available chart_focus values: "monthly_bars", "category_treemap", "category_pie", "yearly_comparison", "savings_rate"

IMPORTANT language rule: Reply in the SAME language as the user's message. If the user writes in Ukrainian — respond in Ukrainian. If in English — respond in English.
Be specific, use numbers. Format responses with markdown."""

SQL_GENERATION_PROMPT = """You have access to a SQLite database. Given the user's question, generate 1-3 SQL SELECT queries that will provide the data needed to answer.

DATABASE SCHEMA:
{db_schema}

RULES:
- Only SELECT queries (read-only)
- Use proper SQLite syntax
- Return ONLY a JSON array of SQL strings, nothing else
- If no query is needed (greeting, general question), return []
- Keep queries efficient, use LIMIT when appropriate

User question: {question}"""


def _get_key():
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        try:
            from src.database import get_secret
            key = get_secret("gemini_api_key")
        except Exception:
            pass
    if not key:
        raise ValueError("GEMINI_API_KEY не знайдено.")
    return key


def _gemini_quick(prompt: str, system: str = "", max_tokens: int = 512) -> str:
    """Quick non-streaming Gemini call for SQL generation."""
    key = _get_key()
    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"maxOutputTokens": max_tokens, "temperature": 0},
    }
    if system:
        body["systemInstruction"] = {"parts": [{"text": system}]}
    resp = requests.post(
        f"{GEMINI_API_URL}/{GEMINI_MODEL}:generateContent",
        headers={"x-goog-api-key": key},
        json=body,
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    parts = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
    return parts[0].get("text", "") if parts else ""


def _generate_and_execute_queries(question: str) -> str:
    """Generate SQL queries for the user's question and execute them."""
    schema = get_db_schema()
    prompt = SQL_GENERATION_PROMPT.format(db_schema=schema, question=question)

    try:
        raw = _gemini_quick(prompt)
        # Extract JSON array from response
        start = raw.find("[")
        end = raw.rfind("]")
        if start == -1 or end == -1:
            return ""
        queries = json.loads(raw[start:end + 1])
        if not queries:
            return ""
    except Exception:
        return ""

    results = []
    for sql in queries[:3]:  # max 3 queries
        result = execute_readonly_query(sql)
        if result and not result.startswith("ERROR"):
            results.append(result)

    # Log AI-requested queries for future context enrichment
    if results:
        try:
            from src.database import set_ai_note
            set_ai_note(
                section="ai_chat_queries",
                note=f"Q: {question}\nSQL: {'; '.join(queries[:3])}",
                prompt=question,
            )
        except Exception:
            pass

    return "\n\n".join(results)


def chat_stream(
    messages: list[dict],
    data_context: str,
) -> Generator[str, None, None]:
    """Stream chat response using Gemini REST API with DB query support."""
    key = _get_key()
    schema = get_db_schema()

    # Pre-query: generate and execute SQL for the latest user message
    db_results = ""
    if messages:
        last_user_msg = ""
        for m in reversed(messages):
            if m["role"] == "user":
                last_user_msg = m["content"]
                break
        if last_user_msg:
            db_results = _generate_and_execute_queries(last_user_msg)

    # Build system prompt with schema + data context + query results
    system = SYSTEM_PROMPT.format(db_schema=schema)
    system += f"\n\n{data_context}"

    # Add extended context (gym, correlations, body, sleep, mood, budget)
    system += _build_extended_context()

    if db_results:
        system += f"\n\n=== DATABASE QUERY RESULTS ===\n{db_results}"

    # Convert messages to Gemini format
    contents = []
    for msg in messages:
        role = "user" if msg["role"] == "user" else "model"
        contents.append({"role": role, "parts": [{"text": msg["content"]}]})

    body = {
        "contents": contents,
        "systemInstruction": {"parts": [{"text": system}]},
        "generationConfig": {"maxOutputTokens": 4096},
    }

    resp = requests.post(
        f"{GEMINI_API_URL}/{GEMINI_MODEL}:streamGenerateContent?alt=sse",
        headers={"x-goog-api-key": key},
        json=body,
        stream=True,
        timeout=60,
    )
    resp.raise_for_status()
    resp.encoding = "utf-8"

    for line in resp.iter_lines(decode_unicode=True):
        if not line or not line.startswith("data: "):
            continue
        data_str = line[6:]
        if data_str.strip() == "[DONE]":
            break
        try:
            chunk = json.loads(data_str)
            parts = chunk.get("candidates", [{}])[0].get("content", {}).get("parts", [])
            if parts and parts[0].get("text"):
                yield parts[0]["text"]
        except (json.JSONDecodeError, IndexError, KeyError):
            continue


def chat_stream_groq(
    messages: list[dict],
    data_context: str,
) -> Generator[str, None, None]:
    """Stream chat response using Groq Llama for fast inference with DB query support."""
    from src.ai_client import _groq_client

    schema = get_db_schema()

    # Pre-query: generate and execute SQL for the latest user message
    db_results = ""
    if messages:
        last_user_msg = ""
        for m in reversed(messages):
            if m["role"] == "user":
                last_user_msg = m["content"]
                break
        if last_user_msg:
            db_results = _generate_and_execute_queries(last_user_msg)

    # Build system prompt with schema + data context + query results
    system = SYSTEM_PROMPT.format(db_schema=schema)
    system += f"\n\n{data_context}"

    # Add extended context (gym, correlations, body, sleep, mood, budget)
    system += _build_extended_context()

    if db_results:
        system += f"\n\n=== DATABASE QUERY RESULTS ===\n{db_results}"

    # Build Groq messages
    groq_msgs = [{"role": "system", "content": system}]
    for msg in messages:
        groq_msgs.append({"role": msg["role"], "content": msg["content"]})

    client = _groq_client()
    resp = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=groq_msgs,
        temperature=0.7,
        max_tokens=4096,
        stream=True,
    )

    for chunk in resp:
        delta = chunk.choices[0].delta
        if delta and delta.content:
            yield delta.content


def _build_extended_context() -> str:
    """Build extended AI context from all available sources."""
    from src.analytics import (
        build_gym_context, build_correlations_context,
        build_body_context, build_sleep_context, build_activities_context,
        build_mood_context, build_budget_context,
    )

    parts = []
    for builder in [build_gym_context, build_correlations_context,
                    build_body_context, build_sleep_context,
                    build_activities_context, build_mood_context,
                    build_budget_context]:
        try:
            ctx = builder()
            if ctx:
                parts.append(ctx)
        except Exception:
            continue
    return "\n\n" + "\n\n".join(parts) if parts else ""


TELEGRAM_REPORT_PROMPT = """Ти — персональний тренер, health coach і фінансовий аналітик.
Проаналізуй дані за {period_label}.

ПРІОРИТЕТИ (від найважливішого):
1. Тренування: прогрес, volume, пропущені м'язові групи
2. Сон і відновлення: sleep score, HRV, Body Battery, RHR
3. Тіло: вага, fat%, тренди
4. Фінанси: витрати, бюджет
5. Настрій

Дай 3-5 конкретних рекомендацій на основі ЦИФР з даних.
Формат: Telegram Markdown (bold *text*, no headers).
Мова: українська.
Макс ~300 слів."""


def generate_telegram_report(context: str, period_type: str = "week") -> str:
    """Generate AI-powered Telegram report from context data."""
    key = _get_key()

    period_label = "минулий тиждень" if period_type == "week" else "минулий місяць"
    prompt = TELEGRAM_REPORT_PROMPT.format(period_label=period_label)
    user_text = f"{prompt}\n\nДані:\n{context}"

    body = {
        "contents": [{"role": "user", "parts": [{"text": user_text}]}],
        "generationConfig": {"maxOutputTokens": 1024, "temperature": 0.7},
    }

    try:
        resp = requests.post(
            f"{GEMINI_API_URL}/{GEMINI_MODEL}:generateContent",
            headers={"x-goog-api-key": key},
            json=body,
            timeout=60,
        )
        resp.raise_for_status()
        data = resp.json()
        parts = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
        return parts[0].get("text", "").strip() if parts else ""
    except Exception:
        return ""


def get_proactive_insights(data_context: str) -> str:
    """Generate proactive financial insights using Gemini."""
    key = _get_key()
    prompt = f"""{data_context}

Проаналізуй ці дані і дай 3-5 ключових інсайти:
- Найбільші зміни між роками
- Категорії з найбільшим зростанням/падінням витрат
- Savings rate тренд
- Будь-які аномалії або цікаві патерни

Формат: кожен інсайт окремим параграфом з emoji на початку. Коротко і по суті."""

    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "systemInstruction": {"parts": [{"text": "Ти — фінансовий аналітик. Відповідай українською."}]},
        "generationConfig": {"maxOutputTokens": 1024},
    }

    resp = requests.post(
        f"{GEMINI_API_URL}/{GEMINI_MODEL}:generateContent",
        headers={"x-goog-api-key": key},
        json=body,
        timeout=60,
    )
    resp.raise_for_status()
    data = resp.json()
    parts = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
    return parts[0].get("text", "Немає даних.") if parts else "Немає даних."


def parse_filter_command(text: str) -> dict | None:
    """Extract <filter_command> JSON from AI response."""
    start = text.find("<filter_command>")
    end = text.find("</filter_command>")
    if start == -1 or end == -1:
        return None
    json_str = text[start + len("<filter_command>"):end].strip()
    try:
        return json.loads(json_str)
    except json.JSONDecodeError:
        return None


def strip_filter_command(text: str) -> str:
    """Remove filter command block from display text."""
    start = text.find("<filter_command>")
    end = text.find("</filter_command>")
    if start == -1 or end == -1:
        return text
    return (text[:start] + text[end + len("</filter_command>"):]).strip()
