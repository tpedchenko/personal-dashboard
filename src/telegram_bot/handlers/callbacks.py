"""Inline keyboard callback handlers."""
import logging
from datetime import date

from telegram import Update
from telegram.ext import ContextTypes

from src.database import add_transaction
from src.telegram_bot.config import (
    _is_allowed, _get_account, _resolve_currency, SHOPPING_GROUP_ID,
)
from src.telegram_bot.builders.shopping import _build_shopping_report

logger = logging.getLogger(__name__)


async def handle_category_callback(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    """Handle inline keyboard category selection."""
    query = update.callback_query
    await query.answer()

    data = query.data
    if not data.startswith("cat:"):
        return

    parts = data.split(":", 3)
    if len(parts) < 4:
        return

    _, category, amount_str, description = parts[0], parts[1], parts[2], parts[3]
    try:
        amount = float(amount_str)
    except (ValueError, TypeError):
        await query.edit_message_text("Помилка: некоректна сума")
        return
    user_id = query.from_user.id
    account = _get_account(user_id)
    tx_date = date.today().isoformat()

    currency, amount_eur, nbu_rate = _resolve_currency(account, amount, tx_date)

    tx_id = add_transaction(
        date=tx_date,
        tx_type="EXPENSE",
        account=account,
        category=category,
        amount_original=amount,
        currency_original=currency,
        amount_eur=amount_eur,
        nbu_rate=nbu_rate,
        description=description,
    )

    await query.edit_message_text(
        f"💸 Додано: {category} — {amount:.2f}{currency}\n"
        f"📝 {description}\n"
        f"📅 {tx_date}\n"
        f"🔢 ID: {tx_id}\n\n"
        f"Скасувати: /cancel"
    )


async def handle_shopping_report_callback(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    """Handle 'Все куплено' inline button."""
    query = update.callback_query
    await query.answer()
    if query.data != "shop:report":
        return

    result = _build_shopping_report(query.from_user.first_name or "bot")
    if result is None:
        await query.edit_message_text("🛒 Список був порожній.")
        return

    text, total_count = result
    if SHOPPING_GROUP_ID:
        try:
            await ctx.bot.send_message(
                chat_id=SHOPPING_GROUP_ID, text=text, parse_mode="Markdown"
            )
            await query.edit_message_text(f"✅ Все куплено ({total_count} позицій). Звіт надіслано в групу.")
        except Exception as e:
            await query.edit_message_text(f"✅ Куплено, але не вдалося надіслати: {e}")
    else:
        await query.edit_message_text(f"✅ Все куплено ({total_count} позицій).")


async def handle_food_callback(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    """Handle food inline button callbacks (delete)."""
    query = update.callback_query
    await query.answer()
    data = query.data
    if not data.startswith("food:del:"):
        return

    entry_id = int(data.split(":")[2])
    from src.database import delete_food_entry
    delete_food_entry(entry_id)
    await query.edit_message_text("🗑 Запис видалено.")
