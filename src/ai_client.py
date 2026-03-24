"""Unified AI client: Groq for fast parsing + voice, Gemini REST API for chat/analytics."""
import os
import json
import re
import time
import logging
from datetime import date
import requests

_log = logging.getLogger(__name__)

from src.retry import retry_request as _retry_request


def _resolve_api_key(env_var: str, secret_key: str = "") -> str | None:
    """Resolve API key: env var first, then per-user DB secret."""
    key = os.getenv(env_var)
    if key:
        return key
    if secret_key:
        try:
            from src.database import get_secret
            return get_secret(secret_key)
        except Exception as e:
            _log.debug("Failed to resolve secret %r: %s", secret_key, e)
    return None


def _groq_client():
    from groq import Groq
    key = _resolve_api_key("GROQ_API_KEY", "groq_api_key")
    if not key:
        raise ValueError("GROQ_API_KEY not set")
    return Groq(api_key=key)


GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models"
GEMINI_MODEL = "gemini-2.5-flash"


def _gemini_generate(contents, system_instruction: str = "", max_tokens: int = 1024) -> str:
    """Call Gemini REST API directly (no google-genai package needed)."""
    key = _resolve_api_key("GEMINI_API_KEY", "gemini_api_key")
    if not key:
        raise ValueError("GEMINI_API_KEY not set")

    body = {
        "contents": contents,
        "generationConfig": {"maxOutputTokens": max_tokens},
    }
    if system_instruction:
        body["systemInstruction"] = {"parts": [{"text": system_instruction}]}

    def _do_request():
        r = requests.post(
            f"{GEMINI_API_URL}/{GEMINI_MODEL}:generateContent",
            headers={"x-goog-api-key": key},
            json=body,
            timeout=60,
        )
        r.raise_for_status()
        return r

    resp = _retry_request(_do_request)
    data = resp.json()
    parts = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
    return parts[0].get("text", "") if parts else ""


def _gemini_generate_stream(contents, system_instruction: str = "", max_tokens: int = 1024):
    """Stream Gemini REST API response — yields text chunks."""
    key = _resolve_api_key("GEMINI_API_KEY", "gemini_api_key")
    if not key:
        raise ValueError("GEMINI_API_KEY not set")

    body = {
        "contents": contents,
        "generationConfig": {"maxOutputTokens": max_tokens},
    }
    if system_instruction:
        body["systemInstruction"] = {"parts": [{"text": system_instruction}]}

    r = requests.post(
        f"{GEMINI_API_URL}/{GEMINI_MODEL}:streamGenerateContent?alt=sse",
        headers={"x-goog-api-key": key},
        json=body,
        timeout=60,
        stream=True,
    )
    r.raise_for_status()

    for line in r.iter_lines(decode_unicode=True):
        if not line or not line.startswith("data: "):
            continue
        data_str = line[len("data: "):]
        if data_str.strip() == "[DONE]":
            break
        try:
            data = json.loads(data_str)
            parts = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
            if parts:
                text = parts[0].get("text", "")
                if text:
                    yield text
        except (json.JSONDecodeError, IndexError, KeyError):
            continue


PARSE_SYSTEM = """You parse Ukrainian/English financial messages into JSON.
Return ONLY valid JSON, nothing else.

Categories (use exactly as written):
Харчування і необхідне, Ресторан та смаколики, Транспорт, Медицина, Відпочинок,
Shopping (не обов'язкове), Комуналка, Навчання, На себе, Подарунки,
Доброчинність / на війну, Bus, Квартира Cordoba, Будинок в Києві,
Маша, Даша, Таня на витрати, Мама О, Зарплата

Output format:
{{"amount": 3.50, "category": "Харчування і необхідне", "description": "кава", "type": "EXPENSE", "date": "YYYY-MM-DD", "confidence": 0.95}}

Rules:
- Default type is EXPENSE. Use INCOME only for salary/зп/дохід.
- Default date is today: {today}.
- If user says "вчора" use yesterday's date.
- amount is always positive.
- "confidence" is 0.0-1.0 showing how sure you are about the category. Use <0.7 if unsure.
- If the message is clearly NOT a financial transaction (a question, greeting, request), return {{"not_transaction": true}}
- Map common words: кава/їжа/обід → Харчування і необхідне,
  ресторан/кафе/смаколики/десерт/суші/піца → Ресторан та смаколики,
  таксі/бензин/метро → Транспорт, аптека/лікар → Медицина,
  зп/зарплата/salary → Зарплата (INCOME), одяг/шопінг → Shopping (не обов'язкове)"""


def parse_transaction(text: str) -> dict | None:
    """Parse natural language into transaction dict using Groq (fast)."""
    try:
        client = _groq_client()
        def _do():
            return client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": PARSE_SYSTEM.format(today=date.today().isoformat())},
                    {"role": "user", "content": text},
                ],
                temperature=0,
                max_tokens=200,
            )
        resp = _retry_request(_do, retries=2)
        raw = resp.choices[0].message.content.strip()
        match = re.search(r'\{.*\}', raw, re.DOTALL)
        if match:
            return json.loads(match.group())
    except Exception as e:
        _log.warning("parse_transaction failed: %s", e)
    return None


def transcribe_voice(audio_bytes: bytes, filename: str = "voice.ogg") -> str:
    """Transcribe voice message using Groq Whisper."""
    try:
        client = _groq_client()
        resp = client.audio.transcriptions.create(
            model="whisper-large-v3",
            file=(filename, audio_bytes),
            language="uk",
        )
        return resp.text.strip()
    except Exception as e:
        raise ValueError(f"Transcription failed: {e}")


def chat_response(message: str, context: str = "") -> str:
    """Get a chat response using Gemini for rich Ukrainian conversation."""
    try:
        system = (
            "Ти — PD Bot, персональний фінансовий асистент. "
            "Відповідай коротко, по-українськи. Використовуй emoji.\n"
        )
        if context:
            system += f"\nДані користувача:\n{context}"

        contents = [{"role": "user", "parts": [{"text": message}]}]
        return _gemini_generate(contents, system_instruction=system) or "Не вдалося отримати відповідь."
    except Exception as e:
        return f"AI помилка: {e}"


def chat_response_stream(message: str, context: str = ""):
    """Stream a chat response using Gemini. Yields text chunks."""
    system = (
        "Ти — PD Bot, персональний фінансовий асистент. "
        "Відповідай коротко, по-українськи. Використовуй emoji.\n"
    )
    if context:
        system += f"\nДані користувача:\n{context}"

    contents = [{"role": "user", "parts": [{"text": message}]}]
    yield from _gemini_generate_stream(contents, system_instruction=system)


def analyze_finances(question: str, data_text: str) -> str:
    """Analyze financial data and answer a question using Gemini."""
    try:
        prompt = f"""Ось фінансові дані:\n{data_text}\n\nПитання: {question}\n
Відповідай коротко, з цифрами. Формат для Telegram (без markdown tables).
Використовуй emoji для кращого вигляду."""
        contents = [{"role": "user", "parts": [{"text": prompt}]}]
        return _gemini_generate(
            contents,
            system_instruction="Ти — фінансовий аналітик. Відповідай українською, коротко. Формат для Telegram.",
        ) or "Немає даних."
    except Exception as e:
        return f"AI помилка: {e}"


def summarize_stats(data_text: str, question: str) -> str:
    """Summarize financial statistics using Gemini."""
    return analyze_finances(question, data_text)


SHOPPING_PARSE_SYSTEM = """You parse messages (Ukrainian/English/Russian) into a shopping list.
Return ONLY valid JSON — an array of objects with "name" and "quantity" fields.

Rules:
- Extract every product/item mentioned
- Each line is a SEPARATE item. Comma-separated items on same line are also separate.
- Default quantity is "1"
- If quantity is specified (e.g. "2 кг", "3 шт", "пачка"), put it as the quantity string
- IMPORTANT: Add a relevant food/product emoji BEFORE the item name
- Capitalize first letter of item name after emoji
- Trim whitespace
- If message is clearly not about shopping/groceries, return []

Emoji examples: 🥛 молоко, 🍞 хліб, 🥚 яйця, 🧀 сир, 🧈 масло, 🍊 апельсини, 🍎 яблука, 🐟 риба, 🍗 курка, 🥩 м'ясо, 🥕 морква, 🧅 цибуля, 🥔 картопля, 🍌 банани, 🫒 олія, 🧃 сік, 🫘 крупа, 🧻 туал. папір, 🧴 шампунь, 🧽 губка, 🍪 печиво, 🍫 шоколад, 🍦 морозиво, 💊 ліки, 🧊 лід, ☕ кава, 🍵 чай, 🥤 напій, 🫙 консерви, 🌽 кукурудза, 🫑 перець, 🍅 помідори, 🥒 огірки, 🥗 салат

Examples:
Input: "молоко, хліб 2, яйця 30шт, сир"
Output: [{"name": "🥛 Молоко", "quantity": "1"}, {"name": "🍞 Хліб", "quantity": "2"}, {"name": "🥚 Яйця", "quantity": "30 шт"}, {"name": "🧀 Сир", "quantity": "1"}]

Input: "Палички кукурудзяні\nСік яблучний в мал пачках"
Output: [{"name": "🌽 Палички кукурудзяні", "quantity": "1"}, {"name": "🧃 Сік яблучний", "quantity": "мал пачки"}]

Input: "купи масло вершкове і 2 пакети кефіру"
Output: [{"name": "🧈 Масло вершкове", "quantity": "1"}, {"name": "🥛 Кефір", "quantity": "2 пакети"}]"""


FOOD_ANALYSIS_SYSTEM = """You analyze food and estimate nutritional values (KBJU).
Return ONLY valid JSON, nothing else.

Output format:
{"name": "Паста карбонара", "weight_g": 350, "calories": 520, "protein_g": 22, "fat_g": 24, "carbs_g": 48}

Rules:
- name: short food name in the language of the input
- weight_g: estimated weight in grams
- calories: estimated kilocalories (kcal)
- protein_g, fat_g, carbs_g: macronutrients in grams
- Be reasonable with estimates based on typical portions
- If weight is specified by user, use it for calculation
- If multiple items described, combine them into one entry with total values
- If the message is clearly NOT about food, return {"not_food": true}"""


def analyze_food_photo(image_bytes: bytes, mime_type: str = "image/jpeg", text_hint: str = "") -> dict | None:
    """Analyze food photo using Gemini vision. Returns {name, weight_g, calories, protein_g, fat_g, carbs_g}."""
    import base64
    try:
        key = _resolve_api_key("GEMINI_API_KEY", "gemini_api_key")
        if not key:
            raise ValueError("GEMINI_API_KEY not set")

        b64 = base64.b64encode(image_bytes).decode()
        parts = [
            {"inline_data": {"mime_type": mime_type, "data": b64}},
            {"text": text_hint or "Оціни КБЖУ цієї страви."},
        ]
        contents = [{"role": "user", "parts": parts}]

        body = {
            "contents": contents,
            "generationConfig": {"maxOutputTokens": 512},
            "systemInstruction": {"parts": [{"text": FOOD_ANALYSIS_SYSTEM}]},
        }
        def _do():
            r = requests.post(
                f"{GEMINI_API_URL}/{GEMINI_MODEL}:generateContent",
                headers={"x-goog-api-key": key},
                json=body,
                timeout=30,
            )
            r.raise_for_status()
            return r
        resp = _retry_request(_do)
        data = resp.json()
        text_out = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
        match = re.search(r'\{.*\}', text_out, re.DOTALL)
        if match:
            result = json.loads(match.group())
            if result.get("not_food"):
                return None
            return result
    except Exception as e:
        _log.warning("analyze_food_photo failed: %s", e)
    return None


def analyze_food_text(text: str) -> dict | None:
    """Analyze food description text. Returns {name, weight_g, calories, protein_g, fat_g, carbs_g}."""
    try:
        contents = [{"role": "user", "parts": [{"text": text}]}]
        raw = _gemini_generate(contents, system_instruction=FOOD_ANALYSIS_SYSTEM, max_tokens=512)
        match = re.search(r'\{.*\}', raw, re.DOTALL)
        if match:
            result = json.loads(match.group())
            if result.get("not_food"):
                return None
            return result
    except Exception as e:
        _log.warning("analyze_food_text failed: %s", e)
    return None


def parse_shopping_list(text: str) -> list[dict]:
    """Parse a text message into a list of shopping items [{name, quantity}]."""
    try:
        client = _groq_client()
        resp = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": SHOPPING_PARSE_SYSTEM},
                {"role": "user", "content": text},
            ],
            temperature=0,
            max_tokens=500,
        )
        raw = resp.choices[0].message.content.strip()
        match = re.search(r'\[.*\]', raw, re.DOTALL)
        if match:
            items = json.loads(match.group())
            return [i for i in items if i.get("name")]
    except Exception as e:
        _log.warning("parse_shopping_list failed: %s", e)
    return []
