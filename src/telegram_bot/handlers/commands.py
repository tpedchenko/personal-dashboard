"""All cmd_* command handlers for PD Bot."""
import logging
from datetime import date, timedelta

from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ContextTypes

import src.database as _db
from src.database import (
    add_transaction,
    upsert_daily_log,
    get_shopping_items,
    get_budget_status,
    add_shopping_items_bulk,
)
from src.date_utils import month_start_iso
from src.ai_client import parse_shopping_list

from src.telegram_bot.config import (
    _is_allowed, _is_tatiana, _get_account,
    ALLOWED_USER_IDS, USER_EMAILS,
    SHOPPING_GROUP_ID,
)
from src.telegram_bot.builders.shopping import _build_shopping_report

logger = logging.getLogger(__name__)


# ─── /myid ────────────────────────────────────────────────────────────────────

async def cmd_myid(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    uid = update.effective_user.id
    name = update.effective_user.first_name or ""
    await update.message.reply_text(f"🆔 {name}, твій Telegram ID: `{uid}`", parse_mode="Markdown")


# ─── /connect ─────────────────────────────────────────────────────────────────

async def cmd_connect(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    """Link Telegram account to PD app via connect code from Settings."""
    if not ctx.args:
        await update.message.reply_text(
            "🔗 *Підключення до Personal Dashboard*\n\n"
            "1. Відкрий PD App → Admin → Telegram\n"
            "2. Натисни 'Generate Code'\n"
            "3. Надішли код: `/connect КОД`",
            parse_mode="Markdown",
        )
        return

    code = ctx.args[0].strip().upper()
    user = update.effective_user

    try:
        from src.database import redeem_telegram_connect_code, save_telegram_link, init_shared_db
        init_shared_db()
        email = redeem_telegram_connect_code(code)
        if email:
            save_telegram_link(user.id, email, user.username or "")
            # Update in-memory caches
            ALLOWED_USER_IDS.add(user.id)
            USER_EMAILS[user.id] = email
            await update.message.reply_text(
                f"✅ Підключено! Telegram пов'язаний з `{email}`\n\n"
                "Тепер ти можеш використовувати всі команди бота.",
                parse_mode="Markdown",
            )
        else:
            await update.message.reply_text(
                "❌ Код невірний або прострочений (дійсний 10 хвилин).\n"
                "Згенеруй новий код в PD App → Admin → Telegram."
            )
    except Exception as e:
        logger.error("Connect error: %s", e)
        await update.message.reply_text("❌ Помилка підключення. Спробуй ще раз.")


# ─── /start ───────────────────────────────────────────────────────────────────

async def cmd_start(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not _is_allowed(update):
        return
    name = update.effective_user.first_name or "друже"
    is_tatiana = _is_tatiana(update.effective_user.id)
    account = _get_account(update.effective_user.id)

    text = (
        f"👋 Привіт, {name}! Я PD Bot — фінансовий асистент.\n\n"
        f"📱 Твій рахунок: *{account}*\n\n"
        "*Команди:*\n"
        "• /stats — статистика за місяць\n"
        "• /budget — статус бюджетів\n"
        "• /balance — баланси рахунків\n"
        "• /week — витрати за тиждень\n"
        "• /exp сума опис — додати витрату\n"
        "• /cancel — скасувати останню транзакцію\n"
        "• /mood N — записати настрій\n"
        "• /eat опис їжі — додати їжу (КБЖУ)\n"
        "• /food — КБЖУ за сьогодні\n"
        "• /list — список покупок\n"
        "• /buy товар1, товар2 — додати в список\n"
        "• /bought — позначити купленим\n"
    )
    if not is_tatiana:
        text += (
            "• /garmin — дані з Garmin\n"
            "• /health — HRV, сон, body battery\n"
            "• /goal — фінансові цілі\n"
            "• /pr [вправа] — персональні рекорди\n"
            "• /task опис — додати задачу\n"
            "• /tasks — переглянути задачі\n"
        )
    text += "• /help — повна інструкція"
    await update.message.reply_text(text, parse_mode="Markdown")


# ─── /help ────────────────────────────────────────────────────────────────────

async def cmd_help(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not _is_allowed(update):
        return
    is_tatiana = _is_tatiana(update.effective_user.id)
    text = (
        "📖 *PD Bot — Команди*\n\n"
        "*💰 Фінанси:*\n"
        "• /exp сума опис — додати витрату\n"
        "• /stats — витрати за поточний місяць\n"
        "• /budget — статус бюджетів\n"
        "• /balance — баланси рахунків\n"
        "• /week — витрати за тиждень\n"
        "• /cancel — скасувати останню транзакцію\n\n"
        "*🍽️ Їжа (КБЖУ):*\n"
        "• /eat опис їжі — додати (напр. `/eat вівсянка 200г`)\n"
        "• 📸 фото їжі — аналіз по фото\n"
        "• /food — підсумок за сьогодні\n"
        "• /food delete — видалити останній запис\n\n"
        "*📋 Інше:*\n"
        "• /mood N — настрій від -5 до +5\n"
        "• /list — список покупок\n"
        "• /buy товар1, товар2 — додати в список\n"
        "• /bought — позначити купленим\n"
    )
    if not is_tatiana:
        text += (
            "• /garmin — останні дані Garmin\n"
            "• /health — HRV, сон, body battery\n"
            "• /goal — фінансові цілі\n"
            "• /pr [вправа] — персональні рекорди\n"
            "• /task опис — додати задачу\n"
            "• /tasks — список задач\n"
        )
    await update.message.reply_text(text, parse_mode="Markdown")


# ─── /mood ────────────────────────────────────────────────────────────────────

async def cmd_mood(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not _is_allowed(update):
        return
    if not ctx.args:
        await update.message.reply_text("Використання: /mood 3 (від -5 до +5)")
        return
    try:
        val = int(ctx.args[0])
        if not -5 <= val <= 5:
            raise ValueError
    except ValueError:
        await update.message.reply_text("Число від -5 до +5, наприклад: /mood 3")
        return

    if val <= -4:
        mood_label = "😱 Жахливий"
    elif val <= -3:
        mood_label = "😤 Дуже поганий"
    elif val <= -2:
        mood_label = "😔 Поганий"
    elif val < 2:
        mood_label = "😐 Нормальний"
    elif val < 3:
        mood_label = "🙂 Гарний"
    else:
        mood_label = "😄 Прекрасний"

    today = date.today().isoformat()
    new_level = upsert_daily_log(
        date=today,
        mood_delta=val,
        sex_count=0, sex_note="",
        bj_count=0, bj_note="",
        kids_hours=0, kids_note="",
        general_note=f"via PD Bot: mood {val:+d}",
    )
    await update.message.reply_text(
        f"✅ Настрій {val:+d} ({mood_label}) записано на {today}\n"
        f"Level: {new_level:+.2f}"
    )


# ─── /stats ───────────────────────────────────────────────────────────────────

async def cmd_stats(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not _is_allowed(update):
        return
    today = date.today()
    month_start = month_start_iso(today)

    with _db.get_conn() as conn:
        row = conn.execute(
            "SELECT COALESCE(SUM(amount_eur),0) FROM transactions "
            "WHERE type='EXPENSE' AND COALESCE(sub_type,'') != 'TRANSFER' AND date >= ?",
            (month_start,),
        ).fetchone()
        expenses = row[0]

        row2 = conn.execute(
            "SELECT COALESCE(SUM(amount_eur),0) FROM transactions "
            "WHERE type='INCOME' AND COALESCE(sub_type,'') != 'TRANSFER' AND date >= ?",
            (month_start,),
        ).fetchone()
        income = row2[0]

        top = conn.execute(
            "SELECT category, SUM(amount_eur) as total FROM transactions "
            "WHERE type='EXPENSE' AND COALESCE(sub_type,'') != 'TRANSFER' AND date >= ? "
            "GROUP BY category ORDER BY total DESC LIMIT 5",
            (month_start,),
        ).fetchall()

    lines = [
        f"📊 *Статистика за {today.strftime('%B %Y')}*\n",
        f"💰 Доходи: {income:,.0f} €",
        f"💸 Витрати: {expenses:,.0f} €",
        f"📈 Нетто: {income - expenses:,.0f} €\n",
        "*Топ витрати:*",
    ]
    for cat, total in top:
        lines.append(f"  • {cat}: {total:,.0f} €")

    await update.message.reply_text("\n".join(lines), parse_mode="Markdown")


# ─── /garmin ──────────────────────────────────────────────────────────────────

async def cmd_garmin(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not _is_allowed(update):
        return
    try:
        with _db.get_conn() as conn:
            row = conn.execute(
                "SELECT date, resting_hr, sleep_score, body_battery_high, "
                "steps, training_readiness_score FROM garmin_daily "
                "ORDER BY date DESC LIMIT 1"
            ).fetchone()
            workout = conn.execute(
                "SELECT date, activity_type, duration_seconds, calories "
                "FROM garmin_activities "
                "ORDER BY date DESC LIMIT 1"
            ).fetchone()

        if not row:
            await update.message.reply_text("Немає даних Garmin.")
            return

        lines = [f"🏃 Garmin — {row[0]}\n"]
        if row[1]:
            lines.append(f"❤️ Пульс спокою: {row[1]} bpm")
        if row[2]:
            lines.append(f"😴 Сон: {row[2]}/100")
        if row[3]:
            lines.append(f"🔋 Body Battery: {row[3]}")
        if row[4]:
            lines.append(f"👣 Кроки: {row[4]:,}")
        if row[5]:
            lines.append(f"💪 Training Ready: {row[5]}%")

        if workout:
            dur = workout[2] // 60 if workout[2] else 0
            act_type = str(workout[1] or "").replace("_", " ")
            lines.append(f"\n🏋️ Останнє: {act_type} ({dur} хв)")
            if workout[3]:
                lines.append(f"🔥 Калорії: {workout[3]}")

        await update.message.reply_text("\n".join(lines))
    except Exception as e:
        await update.message.reply_text(f"Помилка Garmin: {e}")


# ─── /cancel ──────────────────────────────────────────────────────────────────

async def cmd_cancel(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not _is_allowed(update):
        return
    user_account = _get_account(update.effective_user.id)
    with _db.get_conn() as conn:
        row = conn.execute(
            "SELECT id, date, category, amount_eur, description FROM transactions "
            "WHERE account = ? ORDER BY id DESC LIMIT 1",
            (user_account,),
        ).fetchone()
        if not row:
            await update.message.reply_text("Немає транзакцій для скасування.")
            return
        conn.execute("DELETE FROM transactions WHERE id = ?", (row[0],))

    await update.message.reply_text(
        f"🗑 Видалено останню транзакцію:\n"
        f"{row[1]} | {row[2]} | {row[3]:.2f}€ | {row[4]}"
    )


# ─── /task ────────────────────────────────────────────────────────────────────

async def cmd_task(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not _is_allowed(update):
        return
    if not ctx.args:
        await update.message.reply_text(
            "Використання: /task опис задачі\n"
            "Наприклад: /task додати графік витрат по категоріях"
        )
        return

    task_text = " ".join(ctx.args)

    with _db.get_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS bot_tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                text TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                created_by TEXT
            )
        """)
        conn.execute(
            "INSERT INTO bot_tasks (text, created_by) VALUES (?, ?)",
            (task_text, update.effective_user.first_name or "User"),
        )

    await update.message.reply_text(
        f"✅ Задачу додано:\n📝 {task_text}\n\n"
        f"Переглянути всі: /tasks"
    )


# ─── /tasks ───────────────────────────────────────────────────────────────────

async def cmd_tasks(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not _is_allowed(update):
        return

    with _db.get_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS bot_tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                text TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                created_by TEXT
            )
        """)
        rows = conn.execute(
            "SELECT id, text, status, created_at, created_by "
            "FROM bot_tasks ORDER BY id DESC LIMIT 20"
        ).fetchall()

    if not rows:
        await update.message.reply_text("📋 Задач поки немає. Додай: /task опис")
        return

    lines = ["📋 *Задачі:*\n"]
    for r in rows:
        status_icon = "✅" if r[2] == "done" else "⏳"
        lines.append(f"{status_icon} #{r[0]} {r[1]}")

    await update.message.reply_text("\n".join(lines), parse_mode="Markdown")


# ─── /budget ──────────────────────────────────────────────────────────────────

async def cmd_budget(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not _is_allowed(update):
        return
    today = date.today()
    month_start = month_start_iso(today)
    status = get_budget_status(month_start, today.isoformat())
    if not status:
        await update.message.reply_text("📊 Бюджети не налаштовані.\nДодай в Settings → Budget Limits")
        return

    lines = [f"📊 *Бюджети — {today.strftime('%B %Y')}*\n"]
    for s in status:
        pct = s["pct"]
        if pct >= 90:
            bar = "🔴"
        elif pct >= 70:
            bar = "🟡"
        else:
            bar = "🟢"
        lines.append(f"{bar} {s['category']}: {s['spent']:,.0f}€ / {s['budget']:,.0f}€ ({pct:.0f}%)")
    await update.message.reply_text("\n".join(lines), parse_mode="Markdown")


# ─── /balance ─────────────────────────────────────────────────────────────────

async def cmd_balance(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not _is_allowed(update):
        return
    from src.database import get_account_balances, get_uah_balances
    from src.nbu import get_eur_rate

    eur_bals = get_account_balances()
    uah_bals = get_uah_balances()

    if not eur_bals:
        await update.message.reply_text("💳 Немає даних про баланси.")
        return

    _UAH_ACCS = {"Taras Mono", "Taras Sence"}
    _TARAS = ["Taras Mono", "Taras Sence", "Taras Genome",
              "Taras BBVA", "Taras Cash", "Taras Revolute"]
    _TATIANA = ["Tatiana Sence", "Tatiana BBVA"]

    eur_rate = get_eur_rate(date.today().isoformat()) or 44.5

    lines = ["💳 *Баланси рахунків:*\n"]

    def _fmt(acc):
        if acc in _UAH_ACCS:
            bal = uah_bals.get(acc, 0.0)
            return f"₴{bal:+,.0f}"
        else:
            bal = eur_bals.get(acc, 0.0)
            return f"€{bal:+,.0f}"

    def _total_eur(accounts):
        total = 0.0
        for a in accounts:
            if a in _UAH_ACCS:
                uah = uah_bals.get(a, 0.0)
                total += uah / eur_rate
            else:
                total += eur_bals.get(a, 0.0)
        return total

    for acc in _TARAS:
        if acc in eur_bals or acc in uah_bals:
            lines.append(f"{acc}: {_fmt(acc)}")
    t_total = _total_eur(_TARAS)
    lines.append(f"*Taras Total: €{t_total:+,.0f}*\n")

    for acc in _TATIANA:
        if acc in eur_bals or acc in uah_bals:
            lines.append(f"{acc}: {_fmt(acc)}")
    tt_total = _total_eur(_TATIANA)
    lines.append(f"*Tatiana Total: €{tt_total:+,.0f}*")

    await update.message.reply_text("\n".join(lines), parse_mode="Markdown")


# ─── /week ────────────────────────────────────────────────────────────────────

async def cmd_week(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not _is_allowed(update):
        return
    today = date.today()
    week_start = (today - timedelta(days=today.weekday())).isoformat()

    with _db.get_conn() as conn:
        total_row = conn.execute(
            "SELECT COALESCE(SUM(amount_eur),0) FROM transactions "
            "WHERE type='EXPENSE' AND COALESCE(sub_type,'') != 'TRANSFER' AND date >= ?",
            (week_start,),
        ).fetchone()
        total = total_row[0]

        cats = conn.execute(
            "SELECT category, SUM(amount_eur) as s FROM transactions "
            "WHERE type='EXPENSE' AND COALESCE(sub_type,'') != 'TRANSFER' AND date >= ? "
            "GROUP BY category ORDER BY s DESC LIMIT 8",
            (week_start,),
        ).fetchall()

    lines = [
        f"📅 *Витрати за тиждень* ({week_start} — {today.isoformat()})\n",
        f"💸 Всього: *{total:,.0f}€*\n",
    ]
    for cat, s in cats:
        pct = s / total * 100 if total else 0
        lines.append(f"  • {cat}: {s:,.0f}€ ({pct:.0f}%)")

    if not cats:
        lines.append("Витрат цього тижня ще немає.")

    await update.message.reply_text("\n".join(lines), parse_mode="Markdown")


# ─── /list ────────────────────────────────────────────────────────────────────

async def cmd_list(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    """Show current shopping list with inline buttons."""
    if not _is_allowed(update):
        return
    items = get_shopping_items(include_bought=False)
    if not items:
        await update.message.reply_text("🛒 Список покупок порожній.\n\nДодати: просто напиши в групу *ТТ замовлення* або /buy назва", parse_mode="Markdown")
        return

    lines = ["🛒 *Список покупок:*\n"]
    for i, item in enumerate(items, 1):
        qty = f" ×{item['quantity']}" if item['quantity'] != "1" else ""
        lines.append(f"{i}. {item['item_name']}{qty}")
    lines.append(f"\nВсього: {len(items)} позицій")

    keyboard = [[InlineKeyboardButton("✅ Все куплено — надіслати звіт", callback_data="shop:report")]]
    await update.message.reply_text(
        "\n".join(lines),
        parse_mode="Markdown",
        reply_markup=InlineKeyboardMarkup(keyboard),
    )


# ─── /buy ─────────────────────────────────────────────────────────────────────

async def cmd_buy(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    """Add items to shopping list: /buy молоко, хліб, яйця 2"""
    if not _is_allowed(update):
        return
    if not ctx.args:
        await update.message.reply_text("Використання: /buy молоко, хліб, яйця 2")
        return

    text = " ".join(ctx.args)
    items = parse_shopping_list(text)
    if not items:
        raw = [i.strip() for i in text.split(",") if i.strip()]
        items = [{"name": i, "quantity": "1"} for i in raw]

    if items:
        added_by = update.effective_user.first_name or "bot"
        count = add_shopping_items_bulk(items, added_by=added_by)
        names = ", ".join(i["name"] for i in items[:5])
        extra = f" +{len(items)-5} more" if len(items) > 5 else ""
        await update.message.reply_text(f"🛒 Додано {count} товарів: {names}{extra}")
    else:
        await update.message.reply_text("❌ Не вдалося розпізнати товари.")


# ─── /bought ──────────────────────────────────────────────────────────────────

async def cmd_bought(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    """Mark all items as bought and send report to shopping group."""
    if not _is_allowed(update):
        return

    result = _build_shopping_report(update.effective_user.first_name or "bot")
    if result is None:
        await update.message.reply_text("🛒 Список був порожній.")
        return

    text, total_count = result
    if SHOPPING_GROUP_ID:
        try:
            await ctx.bot.send_message(
                chat_id=SHOPPING_GROUP_ID, text=text, parse_mode="Markdown"
            )
            await update.message.reply_text(f"✅ Все куплено ({total_count} позицій). Звіт надіслано в групу.")
        except Exception as e:
            await update.message.reply_text(f"✅ Куплено, але не вдалося надіслати в групу: {e}")
    else:
        await update.message.reply_text(f"✅ Все куплено ({total_count} позицій).")


# ─── /health ──────────────────────────────────────────────────────────────────

async def cmd_health(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not _is_allowed(update):
        return
    try:
        from src.garmin import get_garmin_daily, get_garmin_sleep
        gd = get_garmin_daily(days=2)
        gs = get_garmin_sleep(days=2)
        lines = ["🏥 *Здоров'я (Garmin)*\n"]
        if not gd.empty:
            last = gd.iloc[-1]
            _d = str(last.get("date", ""))[:10]
            lines.append(f"📅 {_d}")
            for label, key in [("❤️ Пульс", "resting_hr"), ("💚 HRV", "hrv_last_night"),
                                ("🔋 Body Battery", "body_battery_high"),
                                ("💪 Training Ready", "training_readiness_score"),
                                ("👣 Кроки", "steps"), ("🏃 VO2max", "vo2max_running")]:
                v = last.get(key)
                if v is not None and not (isinstance(v, float) and __import__("math").isnan(v)):
                    lines.append(f"{label}: {int(v) if key != 'vo2max_running' else f'{v:.1f}'}")
        if not gs.empty:
            sl = gs.iloc[-1]
            ss = sl.get("sleep_score")
            dur = sl.get("duration_seconds")
            if ss is not None and not (isinstance(ss, float) and __import__("math").isnan(ss)):
                lines.append(f"😴 Sleep Score: {int(ss)}/100")
            if dur is not None and not (isinstance(dur, float) and __import__("math").isnan(dur)):
                d = int(dur)
                lines.append(f"🛏 Sleep: {d//3600}h{(d%3600)//60}m")
            deep = sl.get("deep_seconds")
            if deep is not None and not (isinstance(deep, float) and __import__("math").isnan(deep)):
                d = int(deep)
                lines.append(f"🌙 Deep: {d//3600}h{(d%3600)//60}m")
        if len(lines) <= 2:
            lines.append("Немає даних. Синхронізуй Garmin в Settings.")
        await update.message.reply_text("\n".join(lines), parse_mode="Markdown")
    except Exception as e:
        logger.error("cmd_health error: %s", e)
        await update.message.reply_text("❌ Не вдалося отримати дані Garmin")


# ─── /goal ────────────────────────────────────────────────────────────────────

async def cmd_goal(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not _is_allowed(update):
        return
    from src.database import get_savings_goals
    goals = get_savings_goals()
    if not goals:
        await update.message.reply_text("🎯 Фінансових цілей не створено.\nДодай в Settings → Savings Goals")
        return
    lines = ["🎯 *Фінансові цілі:*\n"]
    for g in goals:
        pct = g["current_eur"] / g["target_eur"] * 100 if g["target_eur"] > 0 else 0
        bar_len = int(pct / 10)
        bar = "█" * bar_len + "░" * (10 - bar_len)
        emoji = "✅" if pct >= 100 else ("🟢" if pct >= 70 else ("🟡" if pct >= 40 else "🔴"))
        dl = f" (до {g['deadline']})" if g.get("deadline") else ""
        lines.append(f"{emoji} *{g['name']}*{dl}")
        lines.append(f"  [{bar}] {g['current_eur']:,.0f}€ / {g['target_eur']:,.0f}€ ({pct:.0f}%)")
    await update.message.reply_text("\n".join(lines), parse_mode="Markdown")


# ─── /pr ──────────────────────────────────────────────────────────────────────

async def cmd_pr(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not _is_allowed(update):
        return
    try:
        from src.gym import get_exercise_prs, get_frequent_exercises
        exercise_name = " ".join(ctx.args) if ctx.args else None
        if exercise_name:
            prs = get_exercise_prs(exercise_name)
            if not prs or not prs.get("est_1rm"):
                await update.message.reply_text(f"❌ Немає даних для вправи '{exercise_name}'")
                return
            lines = [f"🏆 *PR — {exercise_name}*\n"]
            if prs.get("est_1rm"):
                lines.append(f"Est. 1RM: {prs['est_1rm']:.1f} kg")
            if prs.get("max_weight"):
                lines.append(f"Max Weight: {prs['max_weight']:.1f} kg")
            if prs.get("max_reps"):
                lines.append(f"Max Reps: {prs['max_reps']}")
            await update.message.reply_text("\n".join(lines), parse_mode="Markdown")
        else:
            df = get_frequent_exercises(10)
            lines = ["🏆 *Personal Records*\n", "Вкажи вправу: `/pr Bench Press`\n", "*Топ вправи:*"]
            for _, row in df.iterrows():
                lines.append(f"  • {row['name']} ({int(row['times_performed'])}x)")
            await update.message.reply_text("\n".join(lines), parse_mode="Markdown")
    except Exception as e:
        logger.error("cmd_pr error: %s", e)
        await update.message.reply_text("❌ Помилка при отриманні PR")


# ─── /food ────────────────────────────────────────────────────────────────────

async def cmd_food(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    """Show daily KBJU summary or delete last entry."""
    if not _is_allowed(update):
        return
    from src.database import get_food_summary_for_date, get_food_log_for_date, delete_food_entry, get_food_last_entry

    if ctx.args and ctx.args[0].lower() == "delete":
        last = get_food_last_entry()
        if last:
            delete_food_entry(last["id"])
            await update.message.reply_text(
                f"🗑 Видалено: {last['description']} ({last['calories']:.0f} kcal)"
            )
        else:
            await update.message.reply_text("Немає записів для видалення.")
        return

    today = date.today().isoformat()
    summary = get_food_summary_for_date(today)
    entries = get_food_log_for_date(today)

    if not entries:
        await update.message.reply_text(
            "🍽️ Сьогодні ще немає записів.\n\n"
            "Надішли *фото їжі* або текст (напр. `вівсянка 200г з бананом`) "
            "щоб додати.",
            parse_mode="Markdown",
        )
        return

    target = 2200
    cal = summary["calories"]
    prot = summary["protein_g"]
    fat = summary["fat_g"]
    carbs = summary["carbs_g"]
    total_macro = prot + fat + carbs
    prot_pct = int(prot / total_macro * 100) if total_macro else 0
    fat_pct = int(fat / total_macro * 100) if total_macro else 0
    carbs_pct = int(carbs / total_macro * 100) if total_macro else 0

    lines = [
        f"🍽️ *Сьогодні: {cal:.0f} / {target} kcal*",
        f"   Б: {prot:.0f}г ({prot_pct}%) | Ж: {fat:.0f}г ({fat_pct}%) | В: {carbs:.0f}г ({carbs_pct}%)\n",
    ]

    for entry in entries:
        t = entry["time"] or "??:??"
        src_icon = "📷" if entry["source"] == "photo" else "⌨️"
        lines.append(f"   {t} — {entry['description']} ({entry['calories']:.0f} kcal) {src_icon}")

    await update.message.reply_text("\n".join(lines), parse_mode="Markdown")


# ─── /eat ─────────────────────────────────────────────────────────────────────

async def cmd_eat(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    """/eat вівсянка 200г з бананом — add food via AI analysis."""
    if not _is_allowed(update):
        return
    if not ctx.args:
        await update.message.reply_text(
            "Використання: /eat вівсянка 200г з бананом\n"
            "Або надішли 📸 фото їжі."
        )
        return

    text = " ".join(ctx.args)
    from src.ai_client import analyze_food_text
    result = analyze_food_text(text)
    if not result:
        await update.message.reply_text("🤔 Не вдалося розпізнати їжу. Спробуй інший опис.")
        return

    from src.database import add_food_entry
    import json as _json
    from datetime import datetime

    now = datetime.now()
    entry_id = add_food_entry(
        date_str=now.strftime("%Y-%m-%d"),
        time_str=now.strftime("%H:%M"),
        description=result.get("name", text[:50]),
        calories=float(result.get("calories", 0)),
        protein_g=float(result.get("protein_g", 0)),
        fat_g=float(result.get("fat_g", 0)),
        carbs_g=float(result.get("carbs_g", 0)),
        weight_g=float(result.get("weight_g", 0)) if result.get("weight_g") else None,
        source="text",
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


# ─── /exp ─────────────────────────────────────────────────────────────────────

async def cmd_exp(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    """/exp 50 кава — explicit expense command."""
    if not _is_allowed(update):
        return
    if not ctx.args:
        await update.message.reply_text(
            "Використання: /exp 3.50 кава\n"
            "Або: /exp 150 таксі"
        )
        return

    text = " ".join(ctx.args)
    from src.telegram_bot.handlers.messages import _process_text
    await _process_text(update, ctx, text)
