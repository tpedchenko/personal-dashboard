"""Message handlers — text, voice, photo, shopping group."""
import io
import logging
from datetime import date

from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ContextTypes

from src.database import (
    add_transaction,
    get_budget_status,
    add_shopping_items_bulk,
)
from src.date_utils import month_start_iso
from src.ai_client import (
    parse_transaction,
    chat_response,
    analyze_finances,
    transcribe_voice,
    parse_shopping_list,
    analyze_food_photo,
)

from src.telegram_bot.config import (
    _is_allowed, _is_tatiana, _get_account, _resolve_currency, _touch_activity,
    get_categories, SHOPPING_GROUP_ID,
)
from src.telegram_bot.builders.finance import _get_financial_summary

logger = logging.getLogger(__name__)


# ─── Text message handler ────────────────────────────────────────────────────

async def handle_message(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    """Handle plain text — analytics questions or chat only. Expenses via /exp."""
    if not _is_allowed(update):
        return
    _touch_activity()
    text = update.message.text.strip()
    if not text:
        return
    answer = _handle_analytics_or_chat(text)
    await update.message.reply_text(answer)


# ─── Voice message handler ───────────────────────────────────────────────────

async def handle_voice(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    """Handle voice messages — transcribe and process as text."""
    if not _is_allowed(update):
        return
    _touch_activity()

    voice = update.message.voice or update.message.audio
    if not voice:
        return

    await update.message.reply_text("🎤 Розпізнаю голос...")

    try:
        file = await ctx.bot.get_file(voice.file_id)
        buf = io.BytesIO()
        await file.download_to_memory(buf)
        audio_bytes = buf.getvalue()

        text = transcribe_voice(audio_bytes, filename="voice.ogg")
        if not text:
            await update.message.reply_text("❌ Не вдалося розпізнати голос.")
            return

        await update.message.reply_text(f"📝 Розпізнано: _{text}_", parse_mode="Markdown")
        await _process_text(update, ctx, text)

    except Exception as e:
        logger.exception("Voice handling error")
        await update.message.reply_text(f"❌ Помилка: {e}")


# ─── Photo handler (food) ────────────────────────────────────────────────────

async def handle_photo(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    """Handle photo messages — analyze as food."""
    if not _is_allowed(update):
        return
    _touch_activity()
    from src.database import add_food_entry
    import json as _json
    from datetime import datetime

    photo = update.message.photo[-1]  # highest resolution
    file = await ctx.bot.get_file(photo.file_id)
    photo_bytes = await file.download_as_bytearray()

    caption = update.message.caption or ""
    result = analyze_food_photo(bytes(photo_bytes), "image/jpeg", caption)

    if not result:
        await update.message.reply_text(
            "🤔 Не вдалося розпізнати їжу на фото. "
            "Спробуй додати текстовий опис."
        )
        return

    now = datetime.now()
    entry_id = add_food_entry(
        date_str=now.strftime("%Y-%m-%d"),
        time_str=now.strftime("%H:%M"),
        description=result.get("name", "Невідома страва"),
        calories=float(result.get("calories", 0)),
        protein_g=float(result.get("protein_g", 0)),
        fat_g=float(result.get("fat_g", 0)),
        carbs_g=float(result.get("carbs_g", 0)),
        weight_g=float(result.get("weight_g", 0)) if result.get("weight_g") else None,
        source="photo",
        photo_file_id=photo.file_id,
        ai_raw_response=_json.dumps(result, ensure_ascii=False),
    )

    cal = result.get("calories", 0)
    prot = result.get("protein_g", 0)
    fat = result.get("fat_g", 0)
    carbs = result.get("carbs_g", 0)
    weight = result.get("weight_g", "")
    weight_str = f" ~{weight:.0f}г" if weight else ""

    keyboard = [[InlineKeyboardButton("❌ Видалити", callback_data=f"food:del:{entry_id}")]]
    await update.message.reply_text(
        f"🍽️ {result.get('name', 'Страва')}{weight_str}\n"
        f"Калорії: {cal:.0f} kcal | Б: {prot:.0f}г | Ж: {fat:.0f}г | В: {carbs:.0f}г\n"
        f"✅ Додано до щоденника",
        reply_markup=InlineKeyboardMarkup(keyboard),
    )


# ─── Core text processing ────────────────────────────────────────────────────

async def _process_text(update: Update, ctx: ContextTypes.DEFAULT_TYPE, text: str):
    """Core text processing — handles transactions, analytics, and chat."""
    user_id = update.effective_user.id
    account = _get_account(user_id)

    parsed = parse_transaction(text)

    if parsed and parsed.get("not_transaction"):
        parsed = None

    logger.info("Processing text from user %d: %s", user_id, text[:50])

    if parsed and "amount" in parsed and parsed["amount"]:
        amount = abs(float(parsed["amount"]))
        category = parsed.get("category", "хз виділені категорії")
        description = parsed.get("description", text)
        tx_type = parsed.get("type", "EXPENSE")
        tx_date = parsed.get("date", date.today().isoformat())
        confidence = float(parsed.get("confidence", 1.0))

        currency, amount_eur, nbu_rate = _resolve_currency(account, amount, tx_date)

        CATEGORIES = get_categories()

        # If low confidence on category — ask user to confirm
        if confidence < 0.7 and tx_type == "EXPENSE":
            keyboard = []
            suggested = [category] if category not in CATEGORIES else []
            options = suggested + [c for c in CATEGORIES if c != category][:7]
            options = [category] + [c for c in options if c != category]

            row = []
            for cat in options[:8]:
                cb_data = f"cat:{cat}:{amount:.2f}:{description}"
                if len(cb_data.encode("utf-8")) > 64:
                    cb_data = f"cat:{cat}:{amount:.2f}:{description[:10]}"
                row.append(InlineKeyboardButton(cat, callback_data=cb_data))
                if len(row) == 2:
                    keyboard.append(row)
                    row = []
            if row:
                keyboard.append(row)

            await update.message.reply_text(
                f"🤔 Не впевнений в категорії.\n"
                f"💰 {amount:.2f}{currency} — {description}\n\n"
                f"Обери категорію:",
                reply_markup=InlineKeyboardMarkup(keyboard),
            )
            return

        tx_id = add_transaction(
            date=tx_date,
            tx_type=tx_type,
            account=account,
            category=category if tx_type == "EXPENSE" else "Зарплата",
            amount_original=amount,
            currency_original=currency,
            amount_eur=amount_eur,
            nbu_rate=nbu_rate,
            description=description,
        )

        emoji = "💰" if tx_type == "INCOME" else "💸"
        acc_label = f"\n👤 {account}" if _is_tatiana(user_id) else ""

        # Check budget after adding expense
        budget_warning = ""
        if tx_type == "EXPENSE":
            try:
                _today = date.today()
                _bs = get_budget_status(month_start_iso(_today), _today.isoformat())
                for _b in _bs:
                    if _b["category"] == category and _b["pct"] >= 80:
                        budget_warning = f"\n⚠️ Бюджет {category}: {_b['spent']:,.0f}€ / {_b['budget']:,.0f}€ ({_b['pct']:.0f}%)"
                        break
            except Exception:
                logger.debug("Budget check failed after adding expense")

        await update.message.reply_text(
            f"{emoji} Додано: {category} — {amount:.2f}{currency}\n"
            f"📝 {description}\n"
            f"📅 {tx_date}{acc_label}\n"
            f"🔢 ID: {tx_id}{budget_warning}\n\n"
            f"Скасувати: /cancel"
        )
    else:
        answer = _handle_analytics_or_chat(text)
        await update.message.reply_text(answer)


def _handle_analytics_or_chat(text: str) -> str:
    """Determine if text is an analytics question and respond accordingly."""
    analytics_keywords = [
        "витрат", "дохід", "статистик", "порівня", "скільки", "категорі",
        "місяц", "рік", "року", "бюджет", "savings", "нетто", "середн",
        "топ", "найбільш", "тренд", "аналіз", "звіт", "лютий", "січень",
        "березень", "квітень", "травень", "червень", "липень", "серпень",
        "вересень", "жовтень", "листопад", "грудень", "january", "february",
        "march", "april", "expenses", "income", "spent", "budget",
    ]

    is_analytics = any(kw in text.lower() for kw in analytics_keywords)

    if is_analytics:
        try:
            data_text = _get_financial_summary()
            return analyze_finances(text, data_text)
        except Exception as e:
            logger.exception("Analytics error")
            return f"Помилка аналізу: {e}"
    else:
        return chat_response(text)


# ─── Shopping group handlers ─────────────────────────────────────────────────

async def handle_shopping_group(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    """Handle messages from the ТТ замовлення group — parse and add to shopping list."""
    if not update.message or not update.message.text:
        return

    chat_id = update.message.chat.id
    if SHOPPING_GROUP_ID and chat_id != SHOPPING_GROUP_ID:
        return

    text = update.message.text.strip()
    if not text or text.startswith("/"):
        return

    items = parse_shopping_list(text)
    if not items:
        return

    added_by = update.effective_user.first_name or "group"
    count = add_shopping_items_bulk(items, added_by=added_by)
    if count > 0:
        names = ", ".join(i["name"] for i in items[:5])
        extra = f" +{len(items)-5}" if len(items) > 5 else ""
        await update.message.reply_text(f"✅ Додано в список: {names}{extra} ({count} шт)")


async def handle_shopping_voice(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    """Handle voice messages from shopping group — transcribe and parse into items."""
    if not update.message:
        return
    chat_id = update.message.chat.id
    if SHOPPING_GROUP_ID and chat_id != SHOPPING_GROUP_ID:
        return

    voice = update.message.voice or update.message.audio
    if not voice:
        return

    try:
        file = await ctx.bot.get_file(voice.file_id)
        buf = io.BytesIO()
        await file.download_to_memory(buf)
        audio_bytes = buf.getvalue()

        text = transcribe_voice(audio_bytes, filename="voice.ogg")
        if not text:
            return

        items = parse_shopping_list(text)
        if not items:
            await update.message.reply_text(f"🎤 Розпізнано: _{text}_\n❌ Товари не знайдено", parse_mode="Markdown")
            return

        added_by = update.effective_user.first_name or "voice"
        count = add_shopping_items_bulk(items, added_by=added_by)
        names = ", ".join(i["name"] for i in items[:5])
        await update.message.reply_text(
            f"🎤 Розпізнано: _{text}_\n✅ Додано: {names} ({count} шт)",
            parse_mode="Markdown"
        )
    except Exception as e:
        logger.exception("Shopping voice error")
