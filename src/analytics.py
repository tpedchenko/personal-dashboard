import pandas as pd
from functools import lru_cache as _lru_cache

# ─── Shared Garmin data cache (avoids triple load in analytics) ──────────────
_garmin_cache: dict[str, pd.DataFrame] = {}


def _get_garmin_cached(kind: str = "daily", days: int = 30) -> pd.DataFrame:
    """Load Garmin data once per analytics run, cache in module-level dict."""
    key = f"{kind}_{days}"
    if key not in _garmin_cache:
        try:
            if kind == "daily":
                from src.garmin import get_garmin_daily
                _garmin_cache[key] = get_garmin_daily(days=days)
            elif kind == "sleep":
                from src.garmin import get_garmin_sleep
                _garmin_cache[key] = get_garmin_sleep(days=days)
            else:
                _garmin_cache[key] = pd.DataFrame()
        except Exception:
            _garmin_cache[key] = pd.DataFrame()
    return _garmin_cache[key]


def clear_garmin_cache():
    """Clear cached Garmin data (call at start of new analytics session)."""
    _garmin_cache.clear()


# Top-level category extraction from hierarchical "A\B" format
def top_category(cat: str) -> str:
    if not cat or pd.isna(cat):
        return "Інше"
    return cat.split("\\")[0].strip()


def sub_category(cat: str) -> str:
    if not cat or pd.isna(cat):
        return ""
    parts = cat.split("\\")
    return parts[1].strip() if len(parts) > 1 else parts[0].strip()


def prepare(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["date"] = pd.to_datetime(df["date"])
    df["year"] = df["date"].dt.year
    df["month"] = df["date"].dt.month
    df["year_month"] = df["date"].dt.to_period("M")
    df["top_category"] = df["category"].apply(top_category)
    df["amount_eur"] = pd.to_numeric(df["amount_eur"], errors="coerce").fillna(0)
    return df


def filter_df(
    df: pd.DataFrame,
    years: list[int] | None = None,
    months: list[int] | None = None,
    tx_type: str | None = None,
) -> pd.DataFrame:
    if years:
        df = df[df["year"].isin(years)]
    if months:
        df = df[df["month"].isin(months)]
    if tx_type:
        df = df[df["type"] == tx_type]
    return df


def _no_transfers(df: pd.DataFrame) -> pd.DataFrame:
    """Remove transfer rows so they don't inflate income/expense totals."""
    if "sub_type" in df.columns:
        df = df[df["sub_type"] != "TRANSFER"]
    return df


def monthly_income_expense(df: pd.DataFrame) -> pd.DataFrame:
    df = _no_transfers(df)
    df = df[df["type"].isin(["INCOME", "EXPENSE"])]
    grouped = (
        df.groupby(["year_month", "type"])["amount_eur"]
        .sum()
        .reset_index()
    )
    grouped["year_month_str"] = grouped["year_month"].astype(str)
    return grouped


def category_breakdown(df: pd.DataFrame, top_n: int = 15) -> pd.DataFrame:
    df_nt = _no_transfers(df)
    expenses = df_nt[df_nt["type"] == "EXPENSE"].copy()
    breakdown = (
        expenses.groupby("top_category")["amount_eur"]
        .sum()
        .reset_index()
        .sort_values("amount_eur", ascending=False)
    )
    top = breakdown.head(top_n)
    other_sum = breakdown.iloc[top_n:]["amount_eur"].sum()
    if other_sum > 0:
        other_row = pd.DataFrame([{"top_category": "Інше", "amount_eur": other_sum}])
        top = pd.concat([top, other_row], ignore_index=True)
    return top


def subcategory_breakdown(df: pd.DataFrame, parent_cat: str) -> pd.DataFrame:
    expenses = _no_transfers(df)
    expenses = expenses[(expenses["type"] == "EXPENSE") & (expenses["top_category"] == parent_cat)].copy()
    expenses["sub"] = expenses["category"].apply(sub_category)
    return (
        expenses.groupby("sub")["amount_eur"]
        .sum()
        .reset_index()
        .sort_values("amount_eur", ascending=False)
    )


def yearly_summary(df: pd.DataFrame) -> pd.DataFrame:
    df = _no_transfers(df)
    rows = []
    for year in sorted(df["year"].dropna().unique()):
        year_df = df[df["year"] == year]
        income = year_df[year_df["type"] == "INCOME"]["amount_eur"].sum()
        expense = year_df[year_df["type"] == "EXPENSE"]["amount_eur"].sum()
        net = income - expense
        savings_rate = (net / income * 100) if income > 0 else 0
        rows.append({
            "Рік": int(year),
            "Доходи €": income,
            "Витрати €": expense,
            "Накопичення €": net,
            "Savings rate %": round(savings_rate, 1),
        })
    return pd.DataFrame(rows)


def kpi_summary(df: pd.DataFrame) -> dict:
    df = _no_transfers(df)
    income = df[df["type"] == "INCOME"]["amount_eur"].sum()
    expense = df[df["type"] == "EXPENSE"]["amount_eur"].sum()
    net = income - expense
    savings_rate = (net / income * 100) if income > 0 else 0
    months_count = df["year_month"].nunique() if "year_month" in df.columns else 1
    return {
        "income": income,
        "expense": expense,
        "net": net,
        "savings_rate": savings_rate,
        "avg_monthly_expense": expense / months_count if months_count else 0,
        "avg_monthly_income": income / months_count if months_count else 0,
    }


def build_data_context(df: pd.DataFrame) -> str:
    """Build a concise text summary of the financial data for Claude's context."""
    summary = yearly_summary(df)
    top_cats = category_breakdown(df, top_n=10)

    lines = ["=== ФІНАНСОВІ ДАНІ ТАРАСА ===\n"]
    lines.append("Річний підсумок (EUR):")
    for _, row in summary.iterrows():
        lines.append(
            f"  {int(row['Рік'])}: Доходи={row['Доходи €']:.0f}€, "
            f"Витрати={row['Витрати €']:.0f}€, "
            f"Нетто={row['Накопичення €']:.0f}€, "
            f"Savings rate={row['Savings rate %']}%"
        )

    lines.append("\nТоп категорії витрат (всі роки, EUR):")
    for _, row in top_cats.iterrows():
        lines.append(f"  {row['top_category']}: {row['amount_eur']:.0f}€")

    total_months = df["year_month"].nunique() if "year_month" in df.columns else 1
    kpi = kpi_summary(df)
    lines.append(f"\nЗагалом місяців даних: {total_months}")
    lines.append(f"Середньомісячні доходи: {kpi['avg_monthly_income']:.0f}€")
    lines.append(f"Середньомісячні витрати: {kpi['avg_monthly_expense']:.0f}€")

    # ── Garmin health data context ──
    try:
        _gd = _get_garmin_cached("daily", 7)
        if not _gd.empty:
            _last = _gd.iloc[-1]
            lines.append("\n=== ЗДОРОВ'Я (Garmin, останні дані) ===")
            _rhr = _last.get("resting_hr")
            if _rhr and not (isinstance(_rhr, float) and pd.isna(_rhr)):
                lines.append(f"Пульс спокою: {int(_rhr)} bpm")
            _hrv = _last.get("hrv_last_night")
            if _hrv and not (isinstance(_hrv, float) and pd.isna(_hrv)):
                lines.append(f"HRV (вчора): {int(_hrv)} ms")
            _hrv_w = _last.get("hrv_weekly_avg")
            if _hrv_w and not (isinstance(_hrv_w, float) and pd.isna(_hrv_w)):
                lines.append(f"HRV (тижневий avg): {int(_hrv_w)} ms")
            _bb = _last.get("body_battery_high")
            if _bb and not (isinstance(_bb, float) and pd.isna(_bb)):
                lines.append(f"Body Battery: {int(_bb)}")
            _tr = _last.get("training_readiness_score")
            if _tr and not (isinstance(_tr, float) and pd.isna(_tr)):
                lines.append(f"Training Readiness: {int(_tr)}%")
            _steps = _last.get("steps")
            if _steps and not (isinstance(_steps, float) and pd.isna(_steps)):
                lines.append(f"Кроки: {int(_steps)}")
            _vo2 = _last.get("vo2max_running")
            if _vo2 and not (isinstance(_vo2, float) and pd.isna(_vo2)):
                lines.append(f"VO2max: {_vo2:.1f}")

            # Week averages
            _avg_rhr = _gd["resting_hr"].dropna().mean()
            _avg_steps = _gd["steps"].dropna().mean()
            if not pd.isna(_avg_rhr):
                lines.append(f"Avg RHR за тиждень: {_avg_rhr:.0f} bpm")
            if not pd.isna(_avg_steps):
                lines.append(f"Avg кроків за тиждень: {_avg_steps:.0f}")

        _gs = _get_garmin_cached("sleep", 7)
        if not _gs.empty:
            _avg_ss = _gs["sleep_score"].dropna().mean()
            _avg_deep = _gs["deep_seconds"].dropna().mean() / 3600 if "deep_seconds" in _gs.columns else 0
            if not pd.isna(_avg_ss):
                lines.append(f"Avg Sleep Score за тиждень: {_avg_ss:.0f}/100")
            if _avg_deep > 0:
                lines.append(f"Avg Deep Sleep: {_avg_deep:.1f}h")
    except Exception:
        pass

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Phase 1: Gym & correlations context
# ---------------------------------------------------------------------------

def _safe_val(v):
    """Return None if value is NaN/None, otherwise the value."""
    if v is None:
        return None
    if isinstance(v, float) and pd.isna(v):
        return None
    return v


def build_gym_context() -> str:
    """Build structured gym/training context for AI."""
    try:
        from datetime import date, timedelta
        from src.database import get_conn, read_sql

        lines = ["=== ТРЕНУВАННЯ ==="]
        since_30 = (date.today() - timedelta(days=30)).isoformat()

        with get_conn() as conn:
            # Workout count & types
            wk = read_sql(
                "SELECT COUNT(*) as cnt, COUNT(DISTINCT program_type) as types "
                "FROM gym_workouts WHERE date >= ?", conn, [since_30])
            if wk.empty or int(wk.iloc[0]["cnt"]) == 0:
                return "=== ТРЕНУВАННЯ ===\nНемає тренувань за останні 30 днів."

            types_df = read_sql(
                "SELECT DISTINCT program_type FROM gym_workouts WHERE date >= ?",
                conn, [since_30])
            type_list = ", ".join(t for t in types_df["program_type"].dropna() if t)
            lines.append(f"Тренувань за 30 днів: {int(wk.iloc[0]['cnt'])} ({type_list})")

            last_w = read_sql(
                "SELECT date, program_type FROM gym_workouts ORDER BY date DESC LIMIT 1",
                conn)
            if not last_w.empty:
                lines.append(f"Останнє: {last_w.iloc[0]['date']} ({last_w.iloc[0].get('program_type', '')})")

            # 1RM estimates (Epley) — top 10 exercises by frequency
            orm = read_sql("""
                SELECT e.name, e.muscle_group,
                    MAX(s.weight_kg) as max_weight,
                    MAX(s.weight_kg * (1.0 + CAST(s.reps AS REAL) / 30.0)) as est_1rm
                FROM gym_exercises e
                JOIN gym_workout_exercises we ON we.exercise_id = e.id
                JOIN gym_sets s ON s.workout_exercise_id = we.id
                JOIN gym_workouts w ON w.id = we.workout_id
                WHERE w.date >= ? AND s.is_warmup = 0 AND s.weight_kg > 0
                GROUP BY e.name, e.muscle_group
                ORDER BY COUNT(s.id) DESC LIMIT 10
            """, conn, [since_30])

            if not orm.empty:
                lines.append("\n1RM (est. Epley, 30 днів):")
                for _, r in orm.iterrows():
                    v = _safe_val(r.get("est_1rm"))
                    if v:
                        lines.append(f"  {r['name']}: {v:.1f} kg ({r.get('muscle_group', '')})")

            # Weekly volume by muscle group (4 weeks)
            since_28 = (date.today() - timedelta(days=28)).isoformat()
            vol = read_sql("""
                SELECT e.muscle_group, COUNT(s.id) as sets
                FROM gym_workouts w
                JOIN gym_workout_exercises we ON we.workout_id = w.id
                JOIN gym_exercises e ON e.id = we.exercise_id
                JOIN gym_sets s ON s.workout_exercise_id = we.id
                WHERE w.date >= ? AND s.is_warmup = 0
                GROUP BY e.muscle_group
                ORDER BY sets DESC
            """, conn, [since_28])

            if not vol.empty:
                lines.append("\nVolume за 4 тижні (сети):")
                for _, r in vol.iterrows():
                    mg = r.get("muscle_group", "?")
                    lines.append(f"  {mg}: {int(r['sets'])} сетів")

            # Recovery: days since last workout per muscle group
            rec = read_sql("""
                SELECT e.muscle_group, MAX(w.date) as last_trained
                FROM gym_workouts w
                JOIN gym_workout_exercises we ON we.workout_id = w.id
                JOIN gym_exercises e ON e.id = we.exercise_id
                GROUP BY e.muscle_group
                ORDER BY last_trained DESC
            """, conn)

            if not rec.empty:
                lines.append("\nВідновлення:")
                today = date.today()
                for _, r in rec.iterrows():
                    mg = r.get("muscle_group", "?")
                    lt = r.get("last_trained")
                    if lt:
                        try:
                            d = (today - date.fromisoformat(str(lt)[:10])).days
                            lines.append(f"  {mg}: {d} днів тому")
                        except (ValueError, TypeError):
                            pass

        return "\n".join(lines)
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("build_gym_context failed: %s", e)
        return ""


def build_correlations_context() -> str:
    """Build cross-domain correlations context for AI."""
    try:
        from datetime import date, timedelta
        from src.database import get_conn, read_sql

        lines = ["=== КОРЕЛЯЦІЇ ==="]
        gd = _get_garmin_cached("daily", 30)
        if gd.empty:
            return ""

        # Get training dates
        since_30 = (date.today() - timedelta(days=30)).isoformat()
        with get_conn() as conn:
            train_dates = read_sql(
                "SELECT DISTINCT date FROM gym_workouts WHERE date >= ?",
                conn, [since_30])

        train_set = set(train_dates["date"].astype(str).str[:10]) if not train_dates.empty else set()
        gd["date_str"] = gd["date"].astype(str).str[:10]
        gd_train = gd[gd["date_str"].isin(train_set)]
        gd_rest = gd[~gd["date_str"].isin(train_set)]

        # Body Battery: training vs rest
        bb_col = "body_battery_high"
        if bb_col in gd.columns:
            bb_train = gd_train[bb_col].dropna().mean() if not gd_train.empty else None
            bb_rest = gd_rest[bb_col].dropna().mean() if not gd_rest.empty else None
            if bb_train and bb_rest:
                lines.append(f"Body Battery avg: тренування={bb_train:.0f}, відпочинок={bb_rest:.0f}")

        # RHR trends
        if "resting_hr" in gd.columns:
            rhr_7 = gd.tail(7)["resting_hr"].dropna().mean()
            rhr_30 = gd["resting_hr"].dropna().mean()
            if not pd.isna(rhr_7):
                lines.append(f"RHR: 7д={rhr_7:.0f}, 30д={rhr_30:.0f} bpm")

        # HRV trend
        if "hrv_last_night" in gd.columns:
            hrv_7 = gd.tail(7)["hrv_last_night"].dropna().mean()
            hrv_30 = gd["hrv_last_night"].dropna().mean()
            if not pd.isna(hrv_7):
                lines.append(f"HRV: 7д={hrv_7:.0f}, 30д={hrv_30:.0f} ms")

        # Mood correlation
        try:
            from src.database import get_all_daily_logs
            logs = get_all_daily_logs(days=30)
            if logs and len(logs) > 0:
                if isinstance(logs, list):
                    import pandas as _pd
                    logs_df = _pd.DataFrame(logs)
                else:
                    logs_df = logs
                if not logs_df.empty and "level" in logs_df.columns:
                    avg_level = logs_df["level"].dropna().mean()
                    if not pd.isna(avg_level):
                        lines.append(f"Avg mood level (30д): {avg_level:.1f}")
        except Exception:
            pass

        return "\n".join(lines) if len(lines) > 1 else ""
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("build_correlations_context failed: %s", e)
        return ""


# ---------------------------------------------------------------------------
# Phase 3: Additional realtime context
# ---------------------------------------------------------------------------

def build_body_context() -> str:
    """Build Withings body metrics context."""
    try:
        from src.withings import get_withings_measurements, get_withings_latest

        lines = ["=== ТІЛО (Withings) ==="]
        latest = get_withings_latest()
        if not latest or not latest.get("weight"):
            return ""

        lines.append(f"Поточна вага: {latest['weight']:.1f} kg")
        if latest.get("fat_ratio"):
            lines.append(f"Fat%: {latest['fat_ratio']:.1f}%")
        if latest.get("fat_free_mass"):
            lines.append(f"Fat-free mass: {latest['fat_free_mass']:.1f} kg")

        # 30-day trend
        m30 = get_withings_measurements(days=30)
        if not m30.empty and len(m30) >= 2:
            w_start = m30.iloc[0].get("weight")
            w_end = m30.iloc[-1].get("weight")
            if _safe_val(w_start) and _safe_val(w_end):
                diff = w_end - w_start
                lines.append(f"30д тренд ваги: {w_start:.1f} → {w_end:.1f} ({diff:+.1f} kg)")

            f_start = m30.iloc[0].get("fat_ratio")
            f_end = m30.iloc[-1].get("fat_ratio")
            if _safe_val(f_start) and _safe_val(f_end):
                lines.append(f"30д тренд fat%: {f_start:.1f} → {f_end:.1f}%")

        return "\n".join(lines)
    except Exception:
        return ""


def build_sleep_context() -> str:
    """Build sleep quality details context."""
    try:
        from src.garmin import get_garmin_sleep
        lines = ["=== СОН (7 днів) ==="]

        gs = get_garmin_sleep(days=7)
        if gs.empty:
            return ""

        avg_score = gs["sleep_score"].dropna().mean() if "sleep_score" in gs.columns else None
        if _safe_val(avg_score):
            lines.append(f"Avg Sleep Score: {avg_score:.0f}/100")

        if "deep_seconds" in gs.columns:
            avg_deep = gs["deep_seconds"].dropna().mean() / 3600
            if avg_deep > 0:
                lines.append(f"Avg Deep Sleep: {avg_deep:.1f}h")

        if "rem_seconds" in gs.columns:
            avg_rem = gs["rem_seconds"].dropna().mean() / 3600
            if avg_rem > 0:
                lines.append(f"Avg REM: {avg_rem:.1f}h")

        if "light_seconds" in gs.columns:
            avg_light = gs["light_seconds"].dropna().mean() / 3600
            if avg_light > 0:
                lines.append(f"Avg Light: {avg_light:.1f}h")

        return "\n".join(lines) if len(lines) > 1 else ""
    except Exception:
        return ""


def build_activities_context() -> str:
    """Build Garmin activities summary context."""
    try:
        from datetime import date, timedelta
        from src.database import get_conn, read_sql

        since = (date.today() - timedelta(days=30)).isoformat()
        with get_conn() as conn:
            df = read_sql(
                "SELECT activity_type, COUNT(*) as cnt, "
                "COALESCE(SUM(distance_m), 0) as total_dist, "
                "COALESCE(SUM(duration_s), 0) as total_dur, "
                "COALESCE(AVG(avg_hr), 0) as avg_hr "
                "FROM garmin_activities WHERE date >= ? "
                "GROUP BY activity_type ORDER BY cnt DESC",
                conn, [since])

        if df.empty:
            return ""

        lines = ["=== АКТИВНОСТІ (30 днів) ==="]
        for _, r in df.iterrows():
            dist_km = r["total_dist"] / 1000 if r["total_dist"] else 0
            dur_h = r["total_dur"] / 3600 if r["total_dur"] else 0
            lines.append(f"  {r['activity_type']}: {int(r['cnt'])}x, {dist_km:.1f}km, {dur_h:.1f}h")

        return "\n".join(lines)
    except Exception:
        return ""


def build_mood_context() -> str:
    """Build mood/energy trend context."""
    try:
        from src.database import get_all_daily_logs
        logs = get_all_daily_logs(days=14)

        if isinstance(logs, list):
            if not logs:
                return ""
            logs_df = pd.DataFrame(logs)
        else:
            logs_df = logs
            if logs_df.empty:
                return ""

        lines = ["=== НАСТРІЙ (14 днів) ==="]

        if "level" in logs_df.columns:
            avg = logs_df["level"].dropna().mean()
            if not pd.isna(avg):
                lines.append(f"Avg level: {avg:.1f}")

        if "mood_delta" in logs_df.columns:
            avg_md = logs_df["mood_delta"].dropna().mean()
            if not pd.isna(avg_md):
                lines.append(f"Avg mood delta: {avg_md:+.1f}")

        if "energy_level" in logs_df.columns:
            avg_e = logs_df["energy_level"].dropna().mean()
            if not pd.isna(avg_e):
                lines.append(f"Avg energy: {avg_e:.1f}")

        if "stress_level" in logs_df.columns:
            avg_s = logs_df["stress_level"].dropna().mean()
            if not pd.isna(avg_s):
                lines.append(f"Avg stress: {avg_s:.1f}")

        entries = len(logs_df)
        lines.append(f"Записів: {entries}")

        return "\n".join(lines) if len(lines) > 1 else ""
    except Exception:
        return ""


def build_budget_context() -> str:
    """Build budget compliance context."""
    try:
        from datetime import date
        from src.database import get_budget_status
        from src.date_utils import month_start_iso

        today = date.today()
        month_start = month_start_iso(today)
        month_end = today.isoformat()

        status = get_budget_status(month_start, month_end)
        if not status:
            return ""

        lines = [f"=== БЮДЖЕТ ({today.strftime('%Y-%m')}) ==="]
        for s in status:
            pct = s.get("pct", 0)
            icon = "🔴" if pct >= 90 else ("⚠️" if pct >= 70 else "✅")
            lines.append(f"  {icon} {s['category']}: {s.get('spent', 0):.0f}/{s.get('budget', 0):.0f}€ ({pct:.0f}%)")

        return "\n".join(lines)
    except Exception:
        return ""


# ---------------------------------------------------------------------------
# Phase 4: Report context builders (for AI Telegram reports)
# ---------------------------------------------------------------------------

def build_weekly_report_context() -> str:
    """Build comprehensive data context for weekly AI Telegram report."""
    from datetime import date, timedelta

    today = date.today()
    week_start = (today - timedelta(days=7)).isoformat()
    prev_week_start = (today - timedelta(days=14)).isoformat()
    today_str = today.isoformat()

    parts = []

    # Training
    try:
        gym = build_gym_context()
        if gym:
            parts.append(gym)
    except Exception:
        pass

    # Sleep & recovery
    try:
        sleep = build_sleep_context()
        if sleep:
            parts.append(sleep)
    except Exception:
        pass

    # Correlations
    try:
        corr = build_correlations_context()
        if corr:
            parts.append(corr)
    except Exception:
        pass

    # Body
    try:
        body = build_body_context()
        if body:
            parts.append(body)
    except Exception:
        pass

    # Finance — this week vs previous
    try:
        from src.database import get_conn, read_sql
        with get_conn() as conn:
            exp_this = read_sql(
                "SELECT COALESCE(SUM(amount_eur), 0) as total FROM transactions "
                "WHERE type = 'EXPENSE' AND COALESCE(sub_type, '') != 'TRANSFER' "
                "AND date >= ? AND date <= ?",
                conn, [week_start, today_str])
            exp_prev = read_sql(
                "SELECT COALESCE(SUM(amount_eur), 0) as total FROM transactions "
                "WHERE type = 'EXPENSE' AND COALESCE(sub_type, '') != 'TRANSFER' "
                "AND date >= ? AND date < ?",
                conn, [prev_week_start, week_start])

            cats = read_sql(
                "SELECT category, SUM(amount_eur) as total FROM transactions "
                "WHERE type = 'EXPENSE' AND COALESCE(sub_type, '') != 'TRANSFER' "
                "AND date >= ? AND date <= ? "
                "GROUP BY category ORDER BY total DESC LIMIT 5",
                conn, [week_start, today_str])

        fin_lines = [f"=== ФІНАНСИ (тиждень {week_start} — {today_str}) ==="]
        this_total = float(exp_this.iloc[0]["total"]) if not exp_this.empty else 0
        prev_total = float(exp_prev.iloc[0]["total"]) if not exp_prev.empty else 0
        pct = ((this_total - prev_total) / prev_total * 100) if prev_total > 0 else 0
        arrow = "↑" if pct > 0 else "↓"
        fin_lines.append(f"Витрати: {this_total:,.0f}€ ({arrow}{abs(pct):.0f}% vs мин. тиждень)")
        if not cats.empty:
            for _, r in cats.iterrows():
                fin_lines.append(f"  {r['category']}: {r['total']:.0f}€")
        parts.append("\n".join(fin_lines))
    except Exception:
        pass

    # Mood
    try:
        mood = build_mood_context()
        if mood:
            parts.append(mood)
    except Exception:
        pass

    return "\n\n".join(parts)


def build_monthly_report_context(month: str) -> str:
    """Build comprehensive data context for monthly AI Telegram report.
    month: 'YYYY-MM' format.
    """
    from datetime import date, timedelta
    import calendar

    try:
        year, mon = int(month[:4]), int(month[5:7])
        _, last_day = calendar.monthrange(year, mon)
        month_start = f"{month}-01"
        month_end = f"{month}-{last_day:02d}"

        # Previous month
        if mon == 1:
            prev_month = f"{year - 1}-12"
        else:
            prev_month = f"{year}-{mon - 1:02d}"
        prev_year, prev_mon = int(prev_month[:4]), int(prev_month[5:7])
        _, prev_last = calendar.monthrange(prev_year, prev_mon)
        prev_start = f"{prev_month}-01"
        prev_end = f"{prev_month}-{prev_last:02d}"
    except (ValueError, IndexError):
        return ""

    parts = [f"=== МІСЯЧНИЙ ЗВІТ: {month} ==="]

    try:
        from src.database import get_conn, read_sql

        with get_conn() as conn:
            # Training
            wk = read_sql(
                "SELECT COUNT(*) as cnt FROM gym_workouts WHERE date >= ? AND date <= ?",
                conn, [month_start, month_end])
            sets = read_sql(
                "SELECT COUNT(s.id) as total FROM gym_sets s "
                "JOIN gym_workout_exercises we ON we.id = s.workout_exercise_id "
                "JOIN gym_workouts w ON w.id = we.workout_id "
                "WHERE w.date >= ? AND w.date <= ? AND s.is_warmup = 0",
                conn, [month_start, month_end])
            wk_cnt = int(wk.iloc[0]["cnt"]) if not wk.empty else 0
            set_cnt = int(sets.iloc[0]["total"]) if not sets.empty else 0
            parts.append(f"\nТРЕНУВАННЯ: {wk_cnt} тренувань, {set_cnt} сетів")

            # 1RM for this month
            orm = read_sql("""
                SELECT e.name,
                    MAX(s.weight_kg * (1.0 + CAST(s.reps AS REAL) / 30.0)) as est_1rm
                FROM gym_exercises e
                JOIN gym_workout_exercises we ON we.exercise_id = e.id
                JOIN gym_sets s ON s.workout_exercise_id = we.id
                JOIN gym_workouts w ON w.id = we.workout_id
                WHERE w.date >= ? AND w.date <= ? AND s.is_warmup = 0 AND s.weight_kg > 0
                GROUP BY e.name ORDER BY est_1rm DESC LIMIT 5
            """, conn, [month_start, month_end])
            # 1RM previous month
            orm_prev = read_sql("""
                SELECT e.name,
                    MAX(s.weight_kg * (1.0 + CAST(s.reps AS REAL) / 30.0)) as est_1rm
                FROM gym_exercises e
                JOIN gym_workout_exercises we ON we.exercise_id = e.id
                JOIN gym_sets s ON s.workout_exercise_id = we.id
                JOIN gym_workouts w ON w.id = we.workout_id
                WHERE w.date >= ? AND w.date <= ? AND s.is_warmup = 0 AND s.weight_kg > 0
                GROUP BY e.name ORDER BY est_1rm DESC LIMIT 10
            """, conn, [prev_start, prev_end])

            prev_map = {}
            if not orm_prev.empty:
                for _, r in orm_prev.iterrows():
                    prev_map[r["name"]] = r["est_1rm"]

            if not orm.empty:
                parts.append("1RM прогрес:")
                for _, r in orm.iterrows():
                    cur = r["est_1rm"]
                    prev = prev_map.get(r["name"])
                    if prev:
                        diff_pct = (cur - prev) / prev * 100
                        parts.append(f"  {r['name']}: {cur:.1f}kg (vs {prev:.1f}kg, {diff_pct:+.1f}%)")
                    else:
                        parts.append(f"  {r['name']}: {cur:.1f}kg")

            # Health (Garmin)
            health = read_sql(
                "SELECT AVG(sleep_score) as ss, AVG(resting_hr) as rhr, "
                "AVG(hrv_last_night) as hrv, AVG(body_battery_high) as bb, "
                "AVG(steps) as steps "
                "FROM garmin_daily WHERE date >= ? AND date <= ?",
                conn, [month_start, month_end])
            health_prev = read_sql(
                "SELECT AVG(sleep_score) as ss, AVG(resting_hr) as rhr, "
                "AVG(hrv_last_night) as hrv, AVG(body_battery_high) as bb "
                "FROM garmin_daily WHERE date >= ? AND date <= ?",
                conn, [prev_start, prev_end])

            if not health.empty:
                h = health.iloc[0]
                hp = health_prev.iloc[0] if not health_prev.empty else {}
                health_lines = ["\nЗДОРОВ'Я:"]
                for label, col, unit in [("Sleep Score", "ss", "/100"), ("RHR", "rhr", " bpm"),
                                          ("HRV", "hrv", " ms"), ("Body Battery", "bb", ""),
                                          ("Кроки", "steps", "")]:
                    v = _safe_val(h.get(col))
                    if v:
                        pv = _safe_val(hp.get(col)) if isinstance(hp, pd.Series) else None
                        cmp = f" (мін. міс: {pv:.0f})" if pv else ""
                        health_lines.append(f"  {label}: {v:.0f}{unit}{cmp}")
                parts.append("\n".join(health_lines))

            # Low BB days
            low_bb = read_sql(
                "SELECT COUNT(*) as cnt FROM garmin_daily "
                "WHERE date >= ? AND date <= ? AND body_battery_high < 50",
                conn, [month_start, month_end])
            if not low_bb.empty:
                parts.append(f"Дні з BB < 50%: {int(low_bb.iloc[0]['cnt'])}")

            # Finance
            fin = read_sql(
                "SELECT type, SUM(amount_eur) as total FROM transactions "
                "WHERE date >= ? AND date <= ? AND COALESCE(sub_type, '') != 'TRANSFER' "
                "GROUP BY type", conn, [month_start, month_end])
            if not fin.empty:
                inc = fin[fin["type"] == "INCOME"]["total"].sum()
                exp = fin[fin["type"] == "EXPENSE"]["total"].sum()
                net = inc - exp
                sr = (net / inc * 100) if inc > 0 else 0
                parts.append(f"\nФІНАНСИ: Доходи={inc:,.0f}€, Витрати={exp:,.0f}€, Нетто={net:+,.0f}€, SR={sr:.0f}%")

                cats = read_sql(
                    "SELECT category, SUM(amount_eur) as total FROM transactions "
                    "WHERE type = 'EXPENSE' AND COALESCE(sub_type, '') != 'TRANSFER' "
                    "AND date >= ? AND date <= ? "
                    "GROUP BY category ORDER BY total DESC LIMIT 5",
                    conn, [month_start, month_end])
                if not cats.empty:
                    for _, r in cats.iterrows():
                        parts.append(f"  {r['category']}: {r['total']:.0f}€")

            # Withings
            wm = read_sql(
                "SELECT weight, fat_ratio FROM withings_measurements "
                "WHERE date >= ? AND date <= ? AND weight IS NOT NULL "
                "ORDER BY date", conn, [month_start, month_end])
            if not wm.empty and len(wm) >= 2:
                ws = wm.iloc[0]["weight"]
                we = wm.iloc[-1]["weight"]
                parts.append(f"\nТІЛО: {ws:.1f} → {we:.1f}kg ({we - ws:+.1f})")
                fs = _safe_val(wm.iloc[0].get("fat_ratio"))
                fe = _safe_val(wm.iloc[-1].get("fat_ratio"))
                if fs and fe:
                    parts.append(f"Fat%: {fs:.1f} → {fe:.1f}%")

            # Mood
            mood = read_sql(
                "SELECT AVG(level) as avg_level, COUNT(*) as cnt "
                "FROM daily_log WHERE date >= ? AND date <= ?",
                conn, [month_start, month_end])
            if not mood.empty and _safe_val(mood.iloc[0].get("avg_level")):
                parts.append(f"\nНАСТРІЙ: avg level={mood.iloc[0]['avg_level']:.1f} ({int(mood.iloc[0]['cnt'])} записів)")

    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("build_monthly_report_context failed: %s", e)

    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Phase 2: Historical snapshots
# ---------------------------------------------------------------------------

def build_monthly_snapshot(month: str) -> str:
    """Build compact monthly snapshot for ai_context_snapshots table. ~500 tokens."""
    return build_monthly_report_context(month)


def build_weekly_snapshot(week: str) -> str:
    """Build compact weekly snapshot. week format: 'YYYY-WNN' (ISO)."""
    from datetime import date, timedelta

    try:
        # Parse ISO week to date range
        # week = '2026-W10'
        parts_w = week.split("-W")
        yr = int(parts_w[0])
        wk = int(parts_w[1])
        # Monday of the ISO week
        jan4 = date(yr, 1, 4)
        start_of_w1 = jan4 - timedelta(days=jan4.isoweekday() - 1)
        monday = start_of_w1 + timedelta(weeks=wk - 1)
        sunday = monday + timedelta(days=6)
        week_start = monday.isoformat()
        week_end = sunday.isoformat()
    except (ValueError, IndexError):
        return ""

    try:
        from src.database import get_conn, read_sql
        lines = [f"=== {week} ({monday.strftime('%d.%m')}—{sunday.strftime('%d.%m')}) ==="]

        with get_conn() as conn:
            # Expenses
            exp = read_sql(
                "SELECT COALESCE(SUM(amount_eur), 0) as total FROM transactions "
                "WHERE type = 'EXPENSE' AND COALESCE(sub_type, '') != 'TRANSFER' "
                "AND date >= ? AND date <= ?", conn, [week_start, week_end])
            total_exp = float(exp.iloc[0]["total"]) if not exp.empty else 0
            lines.append(f"Витрати: {total_exp:,.0f}€")

            # Training
            wk_data = read_sql(
                "SELECT COUNT(*) as cnt FROM gym_workouts WHERE date >= ? AND date <= ?",
                conn, [week_start, week_end])
            wk_cnt = int(wk_data.iloc[0]["cnt"]) if not wk_data.empty else 0
            types = read_sql(
                "SELECT DISTINCT program_type FROM gym_workouts WHERE date >= ? AND date <= ?",
                conn, [week_start, week_end])
            type_list = ", ".join(t for t in types["program_type"].dropna() if t) if not types.empty else ""
            lines.append(f"Тренувань: {wk_cnt} ({type_list})" if type_list else f"Тренувань: {wk_cnt}")

            # Health averages
            gd = read_sql(
                "SELECT AVG(resting_hr) as rhr, AVG(body_battery_high) as bb, "
                "AVG(steps) as steps, AVG(sleep_score) as ss "
                "FROM garmin_daily WHERE date >= ? AND date <= ?",
                conn, [week_start, week_end])
            if not gd.empty:
                g = gd.iloc[0]
                h_parts = []
                if _safe_val(g.get("rhr")):
                    h_parts.append(f"RHR:{g['rhr']:.0f}")
                if _safe_val(g.get("bb")):
                    h_parts.append(f"BB:{g['bb']:.0f}")
                if _safe_val(g.get("steps")):
                    h_parts.append(f"Steps:{g['steps']:,.0f}")
                if _safe_val(g.get("ss")):
                    h_parts.append(f"Sleep:{g['ss']:.0f}")
                if h_parts:
                    lines.append(" | ".join(h_parts))

            # Mood
            mood = read_sql(
                "SELECT AVG(level) as avg_l FROM daily_log WHERE date >= ? AND date <= ?",
                conn, [week_start, week_end])
            if not mood.empty and _safe_val(mood.iloc[0].get("avg_l")):
                lines.append(f"Level: {mood.iloc[0]['avg_l']:.1f}")

        return "\n".join(lines)
    except Exception:
        return ""


def build_yearly_snapshot(year: str) -> str:
    """Build compact yearly snapshot. ~300 tokens."""
    try:
        from src.database import get_conn, read_sql

        year_start = f"{year}-01-01"
        year_end = f"{year}-12-31"

        lines = [f"=== {year} ==="]
        with get_conn() as conn:
            # Finance
            fin = read_sql(
                "SELECT type, SUM(amount_eur) as total FROM transactions "
                "WHERE date >= ? AND date <= ? AND COALESCE(sub_type, '') != 'TRANSFER' "
                "GROUP BY type", conn, [year_start, year_end])
            if not fin.empty:
                inc = fin[fin["type"] == "INCOME"]["total"].sum()
                exp = fin[fin["type"] == "EXPENSE"]["total"].sum()
                sr = ((inc - exp) / inc * 100) if inc > 0 else 0
                lines.append(f"Доходи: {inc:,.0f}€ | Витрати: {exp:,.0f}€ | Savings: {sr:.0f}%")

            # Training
            wk = read_sql(
                "SELECT COUNT(*) as cnt FROM gym_workouts WHERE date >= ? AND date <= ?",
                conn, [year_start, year_end])
            if not wk.empty:
                cnt = int(wk.iloc[0]["cnt"])
                avg_per_wk = cnt / 52
                lines.append(f"Тренувань: {cnt} (avg {avg_per_wk:.1f}/тиждень)")

            # Top 1RM
            orm = read_sql("""
                SELECT e.name,
                    MAX(s.weight_kg * (1.0 + CAST(s.reps AS REAL) / 30.0)) as est_1rm
                FROM gym_exercises e
                JOIN gym_workout_exercises we ON we.exercise_id = e.id
                JOIN gym_sets s ON s.workout_exercise_id = we.id
                JOIN gym_workouts w ON w.id = we.workout_id
                WHERE w.date >= ? AND w.date <= ? AND s.is_warmup = 0 AND s.weight_kg > 0
                GROUP BY e.name ORDER BY est_1rm DESC LIMIT 3
            """, conn, [year_start, year_end])
            if not orm.empty:
                orm_str = ", ".join(f"{r['name']}:{r['est_1rm']:.0f}kg" for _, r in orm.iterrows())
                lines.append(f"Top 1RM: {orm_str}")

            # Health averages
            gd = read_sql(
                "SELECT AVG(resting_hr) as rhr, AVG(sleep_score) as ss "
                "FROM garmin_daily WHERE date >= ? AND date <= ?",
                conn, [year_start, year_end])
            if not gd.empty:
                g = gd.iloc[0]
                if _safe_val(g.get("rhr")):
                    lines.append(f"Avg RHR: {g['rhr']:.0f} bpm")
                if _safe_val(g.get("ss")):
                    lines.append(f"Avg Sleep: {g['ss']:.0f}/100")

            # Weight
            wm = read_sql(
                "SELECT weight, fat_ratio FROM withings_measurements "
                "WHERE date >= ? AND date <= ? AND weight IS NOT NULL ORDER BY date",
                conn, [year_start, year_end])
            if not wm.empty and len(wm) >= 2:
                ws = wm.iloc[0]["weight"]
                we_w = wm.iloc[-1]["weight"]
                lines.append(f"Вага: {ws:.0f} → {we_w:.0f}kg")

        return "\n".join(lines)
    except Exception:
        return ""


def build_full_context() -> str:
    """Build comprehensive context for AI insights generation.
    Combines all domain contexts with comparison data."""
    parts = []

    builders = [
        ("Health (30 days)", lambda: build_data_context(_get_garmin_cached("daily", 30))),
        ("Gym", build_gym_context),
        ("Sleep", build_sleep_context),
        ("Budget", build_budget_context),
        ("Mood", build_mood_context),
        ("Body", build_body_context),
        ("Activities", build_activities_context),
        ("Correlations", build_correlations_context),
    ]

    for name, builder in builders:
        try:
            ctx = builder()
            if ctx:
                parts.append(f"=== {name} ===\n{ctx}")
        except Exception:
            pass

    clear_garmin_cache()
    return "\n\n".join(parts) if parts else "No data available"
