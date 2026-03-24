"""Demo data definitions and generator for demo mode and new users.

Contains DEFAULT_CATEGORIES for demo/new users, anonymized bank accounts,
and generate_demo_data(db_path) for creating a complete demo database.

PostgreSQL: data is stored with explicit user_id for the demo user.
SQLite: data goes into a separate per-user DB file (no user_id needed).
"""
import random
import sqlite3
from datetime import date, timedelta
from pathlib import Path

# ─── Default categories for demo and new users ──────────────────────────────
# These are stored in custom_categories table per user.
# NOT applied to existing users like Taras — only demo and brand-new users.
DEFAULT_CATEGORIES: list[str] = [
    "Groceries",
    "Transport",
    "Restaurants",
    "Entertainment",
    "Health",
    "Utilities",
    "Clothing",
    "Education",
    "Subscriptions",
    "Other",
]

# ─── Mono-style demo accounts ────────────────────────────────────────────────
# Monobank card types: Black (main), White (secondary), Platinum (savings)
DEMO_ACCOUNTS: dict[str, str] = {
    "Mono Black": "€",
    "Mono White": "€",
    "Mono Platinum": "€",
}

# ─── Data generation helpers ────────────────────────────────────────────────

_RNG = random.Random(42)

# 5 years of demo data
_DEMO_DAYS = 365 * 5


def _date_range(start: date, end: date):
    """Yield dates from start to end (inclusive)."""
    d = start
    while d <= end:
        yield d
        d += timedelta(days=1)


def _is_weekend(d: date) -> bool:
    return d.weekday() >= 5


def _get_demo_user_id() -> int | None:
    """Get the user_id of the demo user in PostgreSQL. Returns None for SQLite."""
    from src.db_backend import is_postgres
    if not is_postgres():
        return None
    from src.db_backend import get_pg_connection
    with get_pg_connection() as conn:
        cur = conn._conn.cursor()
        cur.execute("SELECT id FROM users WHERE email = 'demo@pd-app.local'")
        row = cur.fetchone()
        return row[0] if row else None


def _clean_demo_data_pg(user_id: int):
    """Delete all existing demo data for the given user_id in PostgreSQL."""
    from src.db_backend import get_pg_connection
    tables = [
        "gym_sets", "gym_workout_exercises", "gym_workouts",
        "gym_program_exercises", "gym_program_days", "gym_programs", "gym_exercises",
        "transactions", "daily_log", "garmin_daily", "garmin_activities",
        "garmin_sleep", "garmin_body_composition", "withings_measurements",
        "custom_accounts", "custom_categories", "category_favourites",
        "ai_notes", "ai_context_snapshots", "chat_history",
        "budgets", "recurring_transactions", "savings_goals",
        "shopping_items", "shopping_history", "food_log",
        "user_preferences",
    ]
    with get_pg_connection() as conn:
        cur = conn._conn.cursor()
        for t in tables:
            cur.execute(f"DELETE FROM {t} WHERE user_id = %s", (user_id,))
        conn._conn.commit()


# ─── Transaction blueprint ──────────────────────────────────────────────────
# (category, avg_amount_eur, frequency_per_month, account)

_MONTHLY_EXPENSES = [
    # Groceries — ~500 EUR/mo
    ("Groceries", 35, 8, "Mono Black"),
    ("Groceries", 25, 6, "Mono White"),
    # Transport — ~100 EUR/mo
    ("Transport", 30, 3, "Mono Black"),
    # Restaurants — ~150 EUR/mo
    ("Restaurants", 35, 4, "Mono Black"),
    # Entertainment — ~80 EUR/mo
    ("Entertainment", 25, 3, "Mono White"),
    # Health — ~60 EUR/mo
    ("Health", 40, 1, "Mono Black"),
    ("Health", 20, 1, "Mono White"),
    # Utilities — ~120 EUR/mo
    ("Utilities", 120, 1, "Mono Black"),
    # Clothing — ~50 EUR/mo (sporadic)
    ("Clothing", 80, 0.5, "Mono White"),
    # Education — ~40 EUR/mo
    ("Education", 40, 0.7, "Mono Black"),
    # Subscriptions — ~30 EUR/mo
    ("Subscriptions", 30, 1, "Mono Black"),
    # Other — ~30 EUR/mo
    ("Other", 15, 2, "Mono Black"),
]

_SALARY_EUR = 4500  # Monthly salary


def generate_demo_data(db_path: str | Path | None = None):
    """Generate complete demo data for a demo user.

    If db_path is provided, generates data directly in that SQLite DB.
    Otherwise, uses the current DB connection from database module.

    PostgreSQL: uses explicit user_id for all inserts so demo data
    is isolated from real users. Cleans up old demo data first.
    """
    from src.database import (
        init_db,
        add_custom_account,
        get_custom_accounts,
        add_custom_category,
        get_custom_categories,
        get_conn,
        set_current_user,
    )
    from src.gym import init_gym_db, seed_exercises, seed_ppl_program

    from src.db_backend import is_postgres as _is_pg

    # Get demo user_id (None for SQLite)
    demo_uid = _get_demo_user_id()

    # For PG: set demo user context so all DB operations target demo user
    # For SQLite: caller already sets the right user context
    if _is_pg():
        set_current_user("demo@pd-app.local")

    # For PostgreSQL, clean up old demo data first
    if demo_uid is not None:
        _clean_demo_data_pg(demo_uid)

    # Initialize all tables
    init_db()

    # Seed demo accounts (replace defaults)
    existing = {a["name"] for a in get_custom_accounts(active_only=False)}
    for acc_name, acc_cur in DEMO_ACCOUNTS.items():
        if acc_name not in existing:
            add_custom_account(acc_name, acc_cur)

    # Seed default categories into custom_categories table
    existing_cats = set(get_custom_categories())
    for cat in DEFAULT_CATEGORIES:
        if cat not in existing_cats:
            add_custom_category(cat)

    init_gym_db()
    seed_exercises(_force=True)
    seed_ppl_program()

    # Generate 5 years of data
    _generate_transactions()
    _generate_daily_logs()
    _generate_garmin_data(demo_uid)
    _generate_withings_data(demo_uid)
    _generate_gym_data(demo_uid)


# ─── Transaction generator ──────────────────────────────────────────────────

def _generate_transactions():
    """Generate ~5 years of transactions with positive running balances."""
    from src.database import add_transaction, add_transfer

    today = date.today()
    start = today - timedelta(days=_DEMO_DAYS)

    # Initial balance per account (enough for 5 years of expenses)
    _INITIAL_BALANCES = {"Mono Black": 20000.0, "Mono White": 10000.0, "Mono Platinum": 15000.0}
    initial_date = start - timedelta(days=1)
    for acc_name, acc_cur in DEMO_ACCOUNTS.items():
        bal = _INITIAL_BALANCES.get(acc_name, 10000.0)
        add_transaction(
            date=initial_date.isoformat(),
            tx_type="INCOME",
            account=acc_name,
            category="Other",
            amount_original=bal,
            currency_original=acc_cur,
            amount_eur=bal,
            nbu_rate=1.0,
            description="Initial balance",
            source="demo",
        )

    # Salary growth: +3% per year
    base_salary = _SALARY_EUR

    # Generate month by month
    d = start.replace(day=1)
    while d <= today:
        month_end = (d.replace(month=d.month % 12 + 1, day=1) - timedelta(days=1)) if d.month < 12 else d.replace(day=31)
        month_end = min(month_end, today)

        # Salary with yearly growth
        years_elapsed = (d - start).days / 365.0
        salary = round(base_salary * (1.03 ** years_elapsed), 2)

        salary_date = d.replace(day=5)
        if start <= salary_date <= today:
            variation = _RNG.uniform(0.97, 1.03)
            amount = round(salary * variation, 2)
            add_transaction(
                date=salary_date.isoformat(),
                tx_type="INCOME",
                account="Mono Black",
                category="Other",
                amount_original=amount,
                currency_original="€",
                amount_eur=amount,
                nbu_rate=1.0,
                description="Monthly salary",
                source="demo",
            )

        # Occasional transfers to savings (every 2-3 months)
        if _RNG.random() < 0.4:
            transfer_day = _RNG.randint(10, 25)
            try:
                transfer_date = d.replace(day=transfer_day)
            except ValueError:
                transfer_date = month_end
            if start <= transfer_date <= today:
                t_amt = round(_RNG.uniform(300, 800), 2)
                add_transfer(
                    date_str=transfer_date.isoformat(),
                    from_account="Mono Black",
                    to_account="Mono Platinum",
                    from_amount=t_amt,
                    to_amount=t_amt,
                    from_currency="€",
                    to_currency="€",
                    from_eur=t_amt,
                    to_eur=t_amt,
                    nbu_rate=1.0,
                    description="Savings transfer",
                )

        # Monthly expenses with slight inflation over years
        inflation = 1 + 0.02 * years_elapsed
        for cat, avg_amount, freq, account in _MONTHLY_EXPENSES:
            if freq < 1:
                n_tx = 1 if _RNG.random() < freq else 0
            else:
                n_tx = max(1, round(freq + _RNG.gauss(0, 0.5)))

            amount_per_tx = avg_amount * inflation / max(n_tx, 1)

            for _ in range(n_tx):
                tx_day = _RNG.randint(max(1, start.day if d.year == start.year and d.month == start.month else 1),
                                       min(28, month_end.day))
                tx_date = d.replace(day=tx_day)
                if tx_date < start or tx_date > today:
                    continue
                variation = _RNG.uniform(0.75, 1.25)
                amt = round(amount_per_tx * variation, 2)

                add_transaction(
                    date=tx_date.isoformat(),
                    tx_type="EXPENSE",
                    account=account,
                    category=cat,
                    amount_original=amt,
                    currency_original="€",
                    amount_eur=amt,
                    nbu_rate=1.0,
                    description=cat,
                    source="demo",
                )

        # Next month
        if d.month == 12:
            d = d.replace(year=d.year + 1, month=1, day=1)
        else:
            d = d.replace(month=d.month + 1, day=1)


# ─── Daily log generator (mood-sex correlation) ─────────────────────────────

def _generate_daily_logs():
    """Generate 5 years of daily_log entries with mood-sex correlation."""
    from src.database import upsert_daily_log

    today = date.today()
    start = today - timedelta(days=_DEMO_DAYS)

    for d in _date_range(start, today):
        # Skip ~5% of days randomly (realistic gaps)
        if _RNG.random() < 0.05:
            continue

        is_wknd = _is_weekend(d)

        # Sex: ~2-3 times per week (~35% chance per day)
        has_sex = _RNG.random() < 0.35

        if has_sex:
            mood = _RNG.choice([3, 4, 4, 5, 5])
            energy = _RNG.choice([3, 4, 4, 5, 5])
            stress = _RNG.choice([1, 1, 2, 2, 3])
        else:
            mood = _RNG.choice([1, 2, 2, 3, 3, 4])
            energy = _RNG.choice([2, 2, 3, 3, 4])
            stress = _RNG.choice([2, 2, 3, 3, 4, 4])

        if is_wknd:
            mood = min(5, mood + 1)
            stress = max(1, stress - 1)

        focus = max(1, min(5, _RNG.randint(2, 5)))

        upsert_daily_log(
            date=d.isoformat(),
            mood_delta=mood,
            sex_count=1 if has_sex else 0,
            sex_note="",
            bj_count=0,
            bj_note="",
            kids_hours=round(_RNG.uniform(1.0, 5.0), 1) if is_wknd else round(_RNG.uniform(0, 2.0), 1),
            kids_note="",
            general_note="",
            energy_level=energy,
            stress_level=stress,
            focus_quality=focus,
            alcohol=1 if (is_wknd and _RNG.random() < 0.25) else 0,
            caffeine=_RNG.randint(1, 3),
        )


# ─── Withings weight data generator ─────────────────────────────────────────

def _generate_withings_data(demo_uid: int | None = None):
    """Generate 5 years of weight data in withings_measurements table.

    Weight journey: 92kg → ~85kg over 5 years with realistic fluctuations.
    """
    from src.database import get_conn
    from src.db_backend import is_postgres

    today = date.today()
    start = today - timedelta(days=_DEMO_DAYS)

    # Taras real stats: min 71.2, max 101.1, avg 88.9, fat 11.9%, BMI 27.4
    # Journey: started ~101kg 5 years ago → ~85kg now with fluctuations
    start_weight = 101.0
    target_weight = 85.0
    weight = start_weight
    use_pg = is_postgres() and demo_uid is not None

    rows = []
    for d in _date_range(start, today):
        # Weigh ~5 times per week (skip ~28% of days)
        if _RNG.random() < 0.28:
            continue

        total_days = (today - start).days
        day_progress = (d - start).days / max(total_days, 1)

        # Non-linear weight loss: faster at start, plateau periods
        trend_weight = start_weight - (start_weight - target_weight) * (1 - (1 - day_progress) ** 0.6)
        # Seasonal fluctuation (gain in winter, lose in summer)
        seasonal = 1.2 * _seasonal_factor(d)
        # Daily noise
        daily_change = _RNG.gauss(0, 0.5)

        weight = trend_weight + seasonal + daily_change
        weight = max(71.0, min(101.5, weight))
        weight = round(weight, 1)

        height_m = 1.80
        bmi = round(weight / (height_m ** 2), 1)
        # Taras avg fat ~12%, correlates with weight
        fat_ratio = round(8.0 + (weight - 71) * 0.2 + _RNG.uniform(-1.0, 1.0), 1)
        fat_ratio = max(8.0, min(18.0, fat_ratio))
        fat_mass = round(weight * fat_ratio / 100, 1)
        fat_free_mass = round(weight - fat_mass, 1)
        heart_rate = _RNG.randint(52, 68)

        if use_pg:
            rows.append((demo_uid, d.isoformat(), weight, fat_ratio,
                         fat_mass, fat_free_mass, heart_rate, bmi))
        else:
            with get_conn() as conn:
                conn.execute("""
                    INSERT OR REPLACE INTO withings_measurements
                    (date, weight, fat_ratio, fat_mass, fat_free_mass, heart_rate, bmi)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (d.isoformat(), weight, fat_ratio, fat_mass,
                      fat_free_mass, heart_rate, bmi))

    if use_pg and rows:
        from src.db_backend import get_pg_connection
        with get_pg_connection() as conn:
            cur = conn._conn.cursor()
            # Batch insert in chunks for large datasets
            for i in range(0, len(rows), 500):
                chunk = rows[i:i + 500]
                cur.executemany(
                    "INSERT INTO withings_measurements "
                    "(user_id, date, weight, fat_ratio, fat_mass, fat_free_mass, heart_rate, bmi) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
                    chunk,
                )
            conn._conn.commit()


def _seasonal_factor(d: date) -> float:
    """Return seasonal weight factor: positive in winter, negative in summer."""
    import math
    # Day of year normalized to 0-1
    doy = d.timetuple().tm_yday / 365.0
    # Peak weight in January (doy~0), lowest in July (doy~0.5)
    return math.cos(2 * math.pi * doy)


# ─── Garmin data generator ──────────────────────────────────────────────────

def _generate_garmin_data(demo_uid: int | None = None):
    """Generate 5 years of Garmin-like health metrics."""
    from src.db_backend import is_postgres

    today = date.today()
    start = today - timedelta(days=_DEMO_DAYS)
    use_pg = is_postgres() and demo_uid is not None

    if use_pg:
        _generate_garmin_daily_pg(start, today, demo_uid)
        _generate_garmin_activities_pg(start, today, demo_uid)
    else:
        for d in _date_range(start, today):
            _add_garmin_day(d)
        _generate_garmin_activities_sqlite(start, today)


def _add_garmin_day(d: date, demo_uid: int | None = None):
    """Insert one day of garmin_daily data (SQLite path or daily refresh)."""
    from src.database import get_conn
    from src.db_backend import is_postgres

    is_wknd = _is_weekend(d)
    # Taras-like: avg 10k steps (9.6k weekday, 11.5k weekend)
    steps = _RNG.randint(9000, 14000) if is_wknd else _RNG.randint(7500, 12000)
    # Sleep: ~7.4h avg (26640 sec), range 6-9h
    sleep_sec = _RNG.randint(22000, 30000)
    # Resting HR: ~54 bpm (athletic, range 48-60)
    resting_hr = _RNG.randint(48, 60)
    # Body battery: high ~68, low ~13
    body_battery_high = _RNG.randint(55, 82)
    body_battery_low = _RNG.randint(5, max(6, min(25, body_battery_high - 40)))
    sleep_score = _RNG.randint(60, 92)
    # Stress: avg ~33, low stress profile
    avg_stress = _RNG.randint(22, 45)
    training_readiness = _RNG.randint(45, 90)

    params = (
        d.isoformat(), steps, _RNG.randint(2000, 2800), _RNG.randint(300, 700),
        round(steps * 0.75, 1), resting_hr, resting_hr + _RNG.randint(3, 10),
        _RNG.randint(110, 160), avg_stress, avg_stress + _RNG.randint(15, 35),
        body_battery_high, body_battery_low, sleep_sec, sleep_score,
        round(_RNG.uniform(95.0, 99.0), 1), round(_RNG.uniform(14.0, 18.0), 1),
        training_readiness, _RNG.randint(15, 55),
    )

    if is_postgres() and demo_uid is not None:
        from src.db_backend import get_pg_connection
        with get_pg_connection() as conn:
            cur = conn._conn.cursor()
            cur.execute(
                "INSERT INTO garmin_daily "
                "(user_id, date, steps, calories_total, calories_active, distance_m, "
                "resting_hr, avg_hr, max_hr, avg_stress, max_stress, "
                "body_battery_high, body_battery_low, sleep_seconds, sleep_score, "
                "spo2_avg, respiration_avg, training_readiness_score, intensity_minutes) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) "
                "ON CONFLICT (user_id, date) DO UPDATE SET "
                "steps=EXCLUDED.steps, calories_total=EXCLUDED.calories_total, "
                "calories_active=EXCLUDED.calories_active, distance_m=EXCLUDED.distance_m, "
                "resting_hr=EXCLUDED.resting_hr, avg_hr=EXCLUDED.avg_hr, "
                "max_hr=EXCLUDED.max_hr, avg_stress=EXCLUDED.avg_stress, "
                "max_stress=EXCLUDED.max_stress, body_battery_high=EXCLUDED.body_battery_high, "
                "body_battery_low=EXCLUDED.body_battery_low, sleep_seconds=EXCLUDED.sleep_seconds, "
                "sleep_score=EXCLUDED.sleep_score, spo2_avg=EXCLUDED.spo2_avg, "
                "respiration_avg=EXCLUDED.respiration_avg, "
                "training_readiness_score=EXCLUDED.training_readiness_score, "
                "intensity_minutes=EXCLUDED.intensity_minutes",
                (demo_uid,) + params,
            )
            conn._conn.commit()
    else:
        with get_conn() as conn:
            conn.execute("""
                INSERT OR REPLACE INTO garmin_daily
                (date, steps, calories_total, calories_active, distance_m,
                 resting_hr, avg_hr, max_hr, avg_stress, max_stress,
                 body_battery_high, body_battery_low, sleep_seconds, sleep_score,
                 spo2_avg, respiration_avg, training_readiness_score,
                 intensity_minutes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, params)


def _generate_garmin_daily_pg(start: date, end: date, demo_uid: int):
    """Batch insert garmin_daily for PostgreSQL with explicit user_id."""
    from src.db_backend import get_pg_connection

    rows = []
    for d in _date_range(start, end):
        is_wknd = _is_weekend(d)
        # Taras-like: avg 10k steps (9.6k weekday, 11.5k weekend)
        steps = _RNG.randint(9000, 14000) if is_wknd else _RNG.randint(7500, 12000)
        # Sleep: ~7.4h avg (26640 sec), range 6-9h
        sleep_sec = _RNG.randint(22000, 30000)
        # Resting HR: ~54 bpm (athletic, range 48-60)
        resting_hr = _RNG.randint(48, 60)
        # Body battery: high ~68, low ~13
        bb_high = _RNG.randint(55, 82)
        bb_low = _RNG.randint(5, max(6, min(25, bb_high - 40)))
        # Stress: avg ~33, low stress profile
        avg_stress = _RNG.randint(22, 45)

        rows.append((
            demo_uid, d.isoformat(), steps, _RNG.randint(2000, 2800),
            _RNG.randint(300, 700), round(steps * 0.75, 1),
            resting_hr, resting_hr + _RNG.randint(3, 10), _RNG.randint(110, 160),
            avg_stress, avg_stress + _RNG.randint(15, 35),
            bb_high, bb_low, sleep_sec, _RNG.randint(60, 92),
            round(_RNG.uniform(95.0, 99.0), 1), round(_RNG.uniform(14.0, 18.0), 1),
            _RNG.randint(45, 90), _RNG.randint(15, 55),
        ))

    with get_pg_connection() as conn:
        cur = conn._conn.cursor()
        for i in range(0, len(rows), 500):
            chunk = rows[i:i + 500]
            cur.executemany(
                "INSERT INTO garmin_daily "
                "(user_id, date, steps, calories_total, calories_active, distance_m, "
                "resting_hr, avg_hr, max_hr, avg_stress, max_stress, "
                "body_battery_high, body_battery_low, sleep_seconds, sleep_score, "
                "spo2_avg, respiration_avg, training_readiness_score, intensity_minutes) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                chunk,
            )
        conn._conn.commit()


def _generate_garmin_activities_pg(start: date, end: date, demo_uid: int):
    """Batch insert garmin_activities for PostgreSQL with explicit user_id."""
    from src.db_backend import get_pg_connection

    rows = []
    activity_id = 200000
    for d in _date_range(start, end):
        # Taras runs ~1x/week on Saturday, skip ~25% of weeks
        if d.weekday() != 5:
            continue
        if _RNG.random() < 0.25:
            continue

        # Taras avg: 4.6km (range 3-7km), 33 min, HR 130, 393 cal
        distance = round(_RNG.uniform(3000, 7000), 0)
        pace = _RNG.uniform(6.5, 8.0)  # min/km
        duration = distance / 1000.0 * pace * 60  # seconds
        avg_hr = _RNG.randint(120, 140)

        rows.append((
            demo_uid, activity_id, d.isoformat(), "running", "Running",
            round(duration), distance, _RNG.randint(300, 500),
            avg_hr, avg_hr + _RNG.randint(15, 35),
            round(distance / duration, 2), round(_RNG.uniform(2.5, 4.5), 1),
        ))
        activity_id += 1

    with get_pg_connection() as conn:
        cur = conn._conn.cursor()
        for i in range(0, len(rows), 500):
            chunk = rows[i:i + 500]
            cur.executemany(
                "INSERT INTO garmin_activities "
                "(user_id, activity_id, date, activity_type, activity_name, "
                "duration_seconds, distance_m, calories, avg_hr, max_hr, "
                "avg_speed, training_effect_aerobic) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                chunk,
            )
        conn._conn.commit()


def _generate_garmin_activities_sqlite(start: date, end: date):
    """Generate running activities ~2x/week (SQLite path)."""
    from src.database import get_conn

    activity_id = 200000
    for d in _date_range(start, end):
        # Taras runs ~1x/week on Saturday, skip ~25% of weeks
        if d.weekday() != 5:
            continue
        if _RNG.random() < 0.25:
            continue

        # Taras avg: 4.6km (range 3-7km), 33 min, HR 130, 393 cal
        distance = round(_RNG.uniform(3000, 7000), 0)
        pace = _RNG.uniform(6.5, 8.0)  # min/km
        duration = distance / 1000.0 * pace * 60  # seconds
        avg_hr = _RNG.randint(120, 140)

        with get_conn() as conn:
            conn.execute("""
                INSERT OR REPLACE INTO garmin_activities
                (activity_id, date, activity_type, activity_name,
                 duration_seconds, distance_m, calories, avg_hr, max_hr,
                 avg_speed, training_effect_aerobic)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                activity_id, d.isoformat(), "running", "Running",
                round(duration), distance, _RNG.randint(300, 500),
                avg_hr, avg_hr + _RNG.randint(15, 35),
                round(distance / duration, 2), round(_RNG.uniform(2.5, 4.5), 1),
            ))
        activity_id += 1


# ─── Gym data generator ─────────────────────────────────────────────────────

# Taras workout distribution: Push 43%, Pull 26%, Legs 18%, Full Body 14%
_WORKOUT_TYPES = ["Push", "Pull", "Legs", "Full Body"]
_WORKOUT_WEIGHTS = [43, 26, 18, 14]

_PUSH_EXERCISES = [
    "Barbell Bench Press", "Incline Dumbbell Press", "Overhead Press",
    "Lateral Raises", "Tricep Pushdown", "Overhead Tricep Extension",
]
_PULL_EXERCISES = [
    "Barbell Row", "Lat Pulldown", "Seated Cable Row",
    "Face Pulls", "Barbell Curl", "Hammer Curl",
]
_LEGS_EXERCISES = [
    "Barbell Squat", "Romanian Deadlift", "Leg Press",
    "Leg Curl", "Leg Extension", "Calf Raises",
]
_FULL_BODY_EXERCISES = [
    "Barbell Squat", "Barbell Bench Press", "Barbell Row",
    "Overhead Press", "Romanian Deadlift", "Barbell Curl",
]

_EXERCISE_MAP = {
    "Push": _PUSH_EXERCISES,
    "Pull": _PULL_EXERCISES,
    "Legs": _LEGS_EXERCISES,
    "Full Body": _FULL_BODY_EXERCISES,
}

# Taras real avg/max weights: Bench 56/80, Squat 69/100, Cable Row 63/82,
# Machine Lateral Raises 50/68, Incline DB 23/33, Lat Pulldown 58/80,
# Barbell Curl 31/43, Leg Extension 72/98, Leg Press 149/230
_BASE_WEIGHTS = {
    "Barbell Bench Press": 45, "Incline Dumbbell Press": 18, "Overhead Press": 30,
    "Lateral Raises": 10, "Tricep Pushdown": 25, "Overhead Tricep Extension": 18,
    "Barbell Row": 50, "Lat Pulldown": 45, "Seated Cable Row": 50,
    "Face Pulls": 15, "Barbell Curl": 25, "Hammer Curl": 14,
    "Barbell Squat": 55, "Romanian Deadlift": 55, "Leg Press": 120,
    "Leg Curl": 40, "Leg Extension": 55, "Calf Raises": 60,
}


def _generate_sets_for_exercise(ex_name: str, current_w: float, n_sets: int):
    """Generate realistic sets with warmup, intensity, and RPE.

    Returns list of (set_num, weight_kg, reps, intensity, rpe).
    Pattern: 1 warmup set at ~60% weight, then working sets.
    Last 2-3 working sets get tech-fail or full-fail intensity (like Taras).
    """
    sets = []
    has_warmup = n_sets >= 3 and _RNG.random() < 0.7

    for s in range(1, n_sets + 1):
        if s == 1 and has_warmup:
            # Warmup set: lighter weight, higher reps
            w = round(current_w * _RNG.uniform(0.5, 0.65) / 2.5) * 2.5
            reps = _RNG.randint(10, 15)
            intensity = "warmup"
            rpe = _RNG.uniform(4.0, 6.0)
        else:
            w = current_w if s < n_sets else current_w * _RNG.uniform(0.9, 1.0)
            w = round(w / 2.5) * 2.5
            reps = _RNG.randint(8, 12)

            working_set_idx = s - (2 if has_warmup else 1)  # 0-based working set index
            total_working = n_sets - (1 if has_warmup else 0)

            if working_set_idx >= total_working - 1:
                # Last working set: usually full-fail
                intensity = _RNG.choices(
                    ["full-fail", "tech-fail", "1-2 fail"],
                    weights=[50, 35, 15]
                )[0]
                rpe = _RNG.uniform(9.0, 10.0)
                reps = _RNG.randint(6, 10)
            elif working_set_idx >= total_working - 2:
                # Second to last: tech-fail or 1-2 fail
                intensity = _RNG.choices(
                    ["tech-fail", "1-2 fail", "normal"],
                    weights=[45, 40, 15]
                )[0]
                rpe = _RNG.uniform(8.0, 9.5)
                reps = _RNG.randint(7, 11)
            else:
                # Early working sets: mostly normal
                intensity = _RNG.choices(
                    ["normal", "easy", "1-2 fail"],
                    weights=[70, 15, 15]
                )[0]
                rpe = _RNG.uniform(6.5, 8.0)

        rpe = round(rpe, 1)
        sets.append((s, max(w, 2.5), reps, intensity, rpe))
    return sets


def _generate_gym_data(demo_uid: int | None = None):
    """Generate 5 years of PPL workouts ~4x/week with progressive overload.

    Uses batch inserts on PostgreSQL for performance (~1000 workouts).
    """
    from src.db_backend import is_postgres

    today = date.today()
    start = today - timedelta(days=_DEMO_DAYS)
    total_span = (today - start).days

    # Collect workout days (~4x/week: Mon, Tue, Thu, Fri)
    workout_days = []
    for d in _date_range(start, today):
        if d.weekday() in (0, 1, 3, 4):  # Mon, Tue, Thu, Fri
            if _RNG.random() < 0.10:
                continue
            workout_days.append(d)

    total_workouts = len(workout_days)

    if is_postgres() and demo_uid is not None:
        _generate_gym_data_pg(demo_uid, workout_days, total_workouts, total_span)
    else:
        _generate_gym_data_sqlite(workout_days, total_workouts, total_span)


def _generate_gym_data_pg(demo_uid: int, workout_days: list, total_workouts: int, total_span: int):
    """Batch insert gym data for PostgreSQL."""
    from src.db_backend import get_pg_connection
    from src.gym import get_exercises

    exercises_df = get_exercises()
    exercise_id_map = dict(zip(exercises_df["name"], exercises_df["id"]))

    workout_rows = []
    we_rows = []  # workout_exercises
    set_rows = []  # sets: (set_num, weight_kg, reps, intensity, rpe)
    workout_types_list = []  # track type per workout for set generation

    for i, d in enumerate(workout_days):
        w_type = _RNG.choices(_WORKOUT_TYPES, weights=_WORKOUT_WEIGHTS)[0]

        progress = i / max(total_workouts - 1, 1)
        # Taras avg durations: Push 59min, Pull 57min, Legs 51min, Full Body 51min
        duration = _RNG.randint(45, 65) if w_type in ("Legs", "Full Body") else _RNG.randint(50, 70)
        start_hour = _RNG.randint(9, 17)
        start_min = _RNG.randint(0, 59)
        start_time = f"{start_hour:02d}:{start_min:02d}"
        end_min = start_min + duration
        end_hour = start_hour + end_min // 60
        end_time = f"{end_hour:02d}:{end_min % 60:02d}"

        workout_rows.append((
            demo_uid, d.isoformat(), start_time, end_time, "PPL",
            _workout_display_name(w_type), None, duration,
        ))
        workout_types_list.append(w_type)

        exercises = _EXERCISE_MAP[w_type]
        for order, ex_name in enumerate(exercises, 1):
            ex_id = exercise_id_map.get(ex_name)
            if ex_id is None:
                continue
            we_rows.append((ex_id, order))

            # Weight progression: ~30% increase over 5 years with plateaus
            base_w = _BASE_WEIGHTS.get(ex_name, 20)
            current_w = base_w * (1 + 0.30 * progress)
            current_w *= _RNG.uniform(0.95, 1.05)
            current_w = round(current_w / 2.5) * 2.5

            n_sets = _RNG.choices([3, 4], weights=[70, 30])[0]
            for s_tuple in _generate_sets_for_exercise(ex_name, current_w, n_sets):
                set_rows.append(s_tuple)

    # Batch insert
    with get_pg_connection() as conn:
        cur = conn._conn.cursor()

        # Insert workouts and get IDs
        workout_ids = []
        for row in workout_rows:
            cur.execute(
                "INSERT INTO gym_workouts "
                "(user_id, date, start_time, end_time, program_type, workout_name, notes, duration_minutes) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id",
                row,
            )
            workout_ids.append(cur.fetchone()[0])

        # Insert workout_exercises and sets
        w_idx = 0  # workout index
        we_offset = 0
        set_offset = 0

        for w_i, w_id in enumerate(workout_ids):
            w_type = workout_types_list[w_i]
            exercises = _EXERCISE_MAP[w_type]

            for order_idx in range(len(exercises)):
                if we_offset >= len(we_rows):
                    break
                ex_id, order = we_rows[we_offset]
                we_offset += 1

                cur.execute(
                    "INSERT INTO gym_workout_exercises "
                    "(user_id, workout_id, exercise_id, order_num) "
                    "VALUES (%s, %s, %s, %s) RETURNING id",
                    (demo_uid, w_id, ex_id, order),
                )
                we_id = cur.fetchone()[0]

                # Count sets for this exercise
                n_sets = 0
                while set_offset + n_sets < len(set_rows) and set_rows[set_offset + n_sets][0] == n_sets + 1:
                    n_sets += 1
                if n_sets == 0:
                    # Fallback: consume 3 sets
                    n_sets = min(3, len(set_rows) - set_offset)

                for s_i in range(n_sets):
                    if set_offset >= len(set_rows):
                        break
                    set_num, weight_kg, reps, intensity, rpe = set_rows[set_offset]
                    set_offset += 1
                    is_warmup = intensity == "warmup"
                    is_failure = intensity in ("tech-fail", "full-fail")
                    cur.execute(
                        "INSERT INTO gym_sets "
                        "(user_id, workout_exercise_id, set_num, weight_kg, reps, "
                        "is_warmup, intensity, rpe, is_failure) "
                        "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)",
                        (demo_uid, we_id, set_num, weight_kg, reps,
                         bool(is_warmup), intensity, rpe, bool(is_failure)),
                    )

        conn._conn.commit()


def _generate_gym_data_sqlite(workout_days: list, total_workouts: int, total_span: int):
    """Generate gym data for SQLite backend."""
    from src.gym import (
        create_workout, add_exercise_to_workout, add_set,
        finish_workout, get_exercises,
    )

    exercises_df = get_exercises()
    exercise_id_map = dict(zip(exercises_df["name"], exercises_df["id"]))

    for i, d in enumerate(workout_days):
        w_type = _RNG.choices(_WORKOUT_TYPES, weights=_WORKOUT_WEIGHTS)[0]

        progress = i / max(total_workouts - 1, 1)
        duration = _RNG.randint(45, 65) if w_type in ("Legs", "Full Body") else _RNG.randint(50, 70)

        workout_id = create_workout(
            workout_date=d.isoformat(),
            program_type="PPL",
            workout_name=_workout_display_name(w_type),
            duration_minutes=duration,
        )

        exercises = _EXERCISE_MAP[w_type]
        for order, ex_name in enumerate(exercises, 1):
            ex_id = exercise_id_map.get(ex_name)
            if ex_id is None:
                continue
            we_id = add_exercise_to_workout(workout_id, ex_id, order)

            base_w = _BASE_WEIGHTS.get(ex_name, 20)
            current_w = base_w * (1 + 0.30 * progress)
            current_w *= _RNG.uniform(0.95, 1.05)
            current_w = round(current_w / 2.5) * 2.5

            n_sets = _RNG.choices([3, 4], weights=[70, 30])[0]
            for set_num, w, reps, intensity, rpe in _generate_sets_for_exercise(ex_name, current_w, n_sets):
                add_set(we_id, set_num, weight_kg=w, reps=reps, intensity=intensity, rpe=rpe)

        finish_workout(workout_id, duration_minutes=_RNG.randint(55, 80))


def _workout_display_name(ppl_type: str) -> str:
    """Map PPL type to display name matching classify_workouts() output."""
    return {"Push": "Push Day", "Pull": "Pull Day", "Legs": "Legs", "Full Body": "Full Body"}.get(ppl_type, ppl_type)


# ─── Daily refresh helper ───────────────────────────────────────────────────

def add_daily_demo_data():
    """Add today's simulated data. Called each session to keep demo fresh."""
    today = date.today()
    demo_uid = _get_demo_user_id()
    _add_daily_log_today(today)
    _add_garmin_day(today, demo_uid)


def fill_demo_data_gaps():
    """Fill missing demo data for all dates since last entry up to today.

    Called by scheduler daily at 2am to keep demo data continuous even
    when nobody visits the demo dashboard.
    """
    from src.database import get_conn, set_current_user
    from src.db_backend import is_postgres

    if not is_postgres():
        return

    demo_uid = _get_demo_user_id()
    if not demo_uid:
        return

    # Set context to demo user for DB isolation
    set_current_user("demo@pd-app.local")

    today = date.today()

    # Find last garmin_daily date for demo user
    from src.db_backend import get_pg_connection
    with get_pg_connection() as conn:
        cur = conn._conn.cursor()
        cur.execute(
            "SELECT MAX(date::date) FROM garmin_daily WHERE user_id = %s",
            (demo_uid,),
        )
        row = cur.fetchone()
        last_date = row[0] if row and row[0] else today - timedelta(days=7)

    # Fill gaps from last_date+1 to today
    # Use date-seeded RNG so results are deterministic per date
    d = last_date + timedelta(days=1)
    filled = 0
    while d <= today:
        rng = random.Random(d.toordinal())
        global _RNG
        old_rng = _RNG
        _RNG = rng
        try:
            _add_daily_log_today(d)
            _add_garmin_day(d, demo_uid)
            _add_demo_transactions_for_day(d)
            filled += 1
        finally:
            _RNG = old_rng
        d += timedelta(days=1)

    return filled


def _add_demo_transactions_for_day(d: date):
    """Add 0-3 random demo transactions for a given day."""
    from src.database import add_transaction

    n_tx = _RNG.choices([0, 1, 2, 3], weights=[30, 40, 20, 10])[0]
    if n_tx == 0:
        return

    categories = ["Groceries", "Transport", "Restaurants", "Entertainment",
                  "Health", "Utilities", "Subscriptions", "Other"]
    accounts = list(DEMO_ACCOUNTS.keys())

    for _ in range(n_tx):
        cat = _RNG.choice(categories)
        acc = _RNG.choice(accounts) if accounts else "Mono Black"
        amount = round(_RNG.uniform(5, 150), 2)

        add_transaction(
            date=d.isoformat(),
            tx_type="EXPENSE",
            account=acc,
            category=cat,
            amount_original=amount,
            currency_original="€",
            amount_eur=amount,
            nbu_rate=1.0,
            description=f"Demo {cat.lower()}",
            source="demo",
        )


def _add_daily_log_today(d: date):
    """Add a single daily log entry for today."""
    from src.database import upsert_daily_log

    has_sex = _RNG.random() < 0.35
    mood = _RNG.choice([4, 4, 5]) if has_sex else _RNG.choice([2, 3, 3, 4])
    energy = _RNG.choice([3, 4, 5]) if has_sex else _RNG.choice([2, 3, 4])
    stress = _RNG.choice([1, 2, 2]) if has_sex else _RNG.choice([2, 3, 4])

    upsert_daily_log(
        date=d.isoformat(),
        mood_delta=mood,
        sex_count=1 if has_sex else 0,
        sex_note="",
        bj_count=0,
        bj_note="",
        kids_hours=round(_RNG.uniform(0.5, 3.0), 1),
        kids_note="",
        general_note="",
        energy_level=energy,
        stress_level=stress,
        focus_quality=max(1, min(5, _RNG.randint(2, 5))),
        alcohol=0,
        caffeine=_RNG.randint(1, 3),
    )


def seed_default_categories():
    """Seed DEFAULT_CATEGORIES into custom_categories for the current user.

    Safe to call multiple times — uses INSERT OR IGNORE.
    """
    from src.database import add_custom_category, get_custom_categories

    existing = set(get_custom_categories())
    for cat in DEFAULT_CATEGORIES:
        if cat not in existing:
            add_custom_category(cat)
