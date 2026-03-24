"""Prepare PD data for LLM fine-tuning in chat JSONL format.

Phase 3: Extended with investments, body composition, garmin activities,
comparative/trend analysis, recommendations, and multi-turn dialogues.
Target: 500+ training examples.
"""
import csv
import json
import random
from collections import defaultdict
from datetime import datetime, timedelta

BASE = "/Users/taras/Documents/taras-code/pd/ml-training"
OUTPUT = f"{BASE}/train.jsonl"
VAL_OUTPUT = f"{BASE}/valid.jsonl"

SYSTEM_QA = """Ти — персональний AI-асистент Тараса. Ти маєш повний доступ до його фінансових, здоров'я та лайфстайл даних.
Відповідай українською мовою. Будь конкретним — використовуй числа, дати, тренди.
Ти знаєш його звички витрат, стан здоров'я, тренування, настрій та сон."""

SYSTEM_INSIGHTS = "Ти — AI аналітик персонального дашборду. Аналізуй дані користувача і генеруй 3-5 інсайтів як JSON array."

examples = []
stats = defaultdict(int)


def add_example(messages, category="other"):
    examples.append({"messages": messages})
    stats[category] += 1


# ============================================================
# Load all CSVs
# ============================================================
def load_csv(name):
    path = f"{BASE}/{name}"
    try:
        with open(path) as f:
            rows = list(csv.DictReader(f))
        print(f"  Loaded {name}: {len(rows)} rows")
        return rows
    except FileNotFoundError:
        print(f"  WARNING: {name} not found")
        return []


print("=== Loading data ===")
transactions = load_csv("transactions.csv")
daily_logs = load_csv("daily_logs.csv")
garmin = load_csv("garmin.csv")
garmin_sleep = load_csv("garmin_sleep.csv")
workouts = load_csv("workouts.csv")
reference_insights = load_csv("reference_insights.csv")
body_composition = load_csv("body_composition.csv")
garmin_activities = load_csv("garmin_activities.csv")
investments = load_csv("investments.csv")
portfolio = load_csv("portfolio.csv")


def safe_float(val, default=0):
    try:
        return float(val)
    except (ValueError, TypeError):
        return default


def safe_int(val, default=0):
    try:
        return int(val)
    except (ValueError, TypeError):
        return default


# ============================================================
# 1. Reference Insights (Claude-generated) → training examples
# ============================================================
print("\n=== Phase 1: Reference insights ===")

PAGE_NAMES_UA = {
    "finance": "фінанси",
    "gym": "зал",
    "exercises": "вправи",
    "my-day": "мій день",
    "investments": "інвестиції",
    "list": "список покупок",
}

PERIOD_NAMES_UA = {
    "today": "сьогодні",
    "this_week": "цей тиждень",
    "this_month": "цей місяць",
    "this_year": "цей рік",
}

for row in reference_insights:
    page = row.get("page", "")
    period = row.get("period", "")
    date = row.get("date", "")
    insights_json = row.get("insights_json", "")
    prompt_used = row.get("prompt_used", "")

    if not insights_json or not prompt_used:
        continue

    page_ua = PAGE_NAMES_UA.get(page, page)
    period_ua = PERIOD_NAMES_UA.get(period, period)

    user_prompt = f"Проаналізуй мої дані: {page_ua}, період: {period_ua} (дата: {date}). Промпт: {prompt_used}"

    add_example([
        {"role": "system", "content": SYSTEM_INSIGHTS},
        {"role": "user", "content": user_prompt},
        {"role": "assistant", "content": insights_json},
    ], category="reference_insights")

print(f"  → {stats['reference_insights']} reference insight examples")


# ============================================================
# 2. Financial patterns (monthly summaries)
# ============================================================
print("\n=== Phase 2: Financial patterns ===")

tx_by_month = defaultdict(lambda: {"income": 0, "expenses": 0, "categories": defaultdict(float), "count": 0})
for row in transactions:
    if not row.get("date") or not row.get("amount_eur"):
        continue
    month = row["date"][:7]
    amt = abs(safe_float(row["amount_eur"]))
    tx_by_month[month]["count"] += 1
    if row["type"] == "INCOME" and row.get("sub_type") != "TRANSFER":
        tx_by_month[month]["income"] += amt
    elif row["type"] == "EXPENSE" and row.get("sub_type") != "TRANSFER":
        tx_by_month[month]["expenses"] += amt
        cat = row.get("category") or "Other"
        parent = cat.split(" / ")[0]
        tx_by_month[month]["categories"][parent] += amt

# Monthly summaries
sorted_months = sorted(tx_by_month.keys())
for month in sorted_months[-18:]:
    data = tx_by_month[month]
    inc = round(data["income"])
    exp = round(data["expenses"])
    bal = inc - exp
    top_cats = sorted(data["categories"].items(), key=lambda x: -x[1])[:5]
    cats_str = ", ".join(f"{c}: {round(a)} EUR" for c, a in top_cats)

    add_example([
        {"role": "system", "content": SYSTEM_QA},
        {"role": "user", "content": f"Які мої фінанси за {month}?"},
        {"role": "assistant", "content": f"За {month}:\n• Дохід: {inc} EUR\n• Витрати: {exp} EUR\n• Баланс: {'+' if bal >= 0 else ''}{bal} EUR\n• Топ категорії: {cats_str}"},
    ], "finance_monthly")

    add_example([
        {"role": "system", "content": SYSTEM_QA},
        {"role": "user", "content": f"Скільки я витратив у {month}?"},
        {"role": "assistant", "content": f"У {month} ти витратив {exp} EUR ({data['count']} транзакцій).\nТоп категорії: {cats_str}\nДохід: {inc} EUR, баланс: {'+' if bal >= 0 else ''}{bal} EUR."},
    ], "finance_monthly_aug")

# Quarterly summaries
quarters = defaultdict(lambda: {"income": 0, "expenses": 0, "months": []})
for month in sorted_months:
    year = month[:4]
    q = (int(month[5:7]) - 1) // 3 + 1
    qkey = f"{year}-Q{q}"
    quarters[qkey]["income"] += tx_by_month[month]["income"]
    quarters[qkey]["expenses"] += tx_by_month[month]["expenses"]
    quarters[qkey]["months"].append(month)

for qkey, qdata in sorted(quarters.items())[-6:]:
    inc = round(qdata["income"])
    exp = round(qdata["expenses"])
    bal = inc - exp
    months_str = ", ".join(qdata["months"])
    add_example([
        {"role": "system", "content": SYSTEM_QA},
        {"role": "user", "content": f"Як мої фінанси за {qkey}?"},
        {"role": "assistant", "content": f"За {qkey} ({months_str}):\n• Дохід: {inc} EUR\n• Витрати: {exp} EUR\n• Баланс: {'+' if bal >= 0 else ''}{bal} EUR\n• Середні витрати/міс: {round(exp / max(len(qdata['months']), 1))} EUR"},
    ], "finance_quarterly")

print(f"  → {stats['finance_monthly']} monthly + {stats['finance_monthly_aug']} augmented + {stats['finance_quarterly']} quarterly")


# ============================================================
# 3. Comparative finance (month vs month)
# ============================================================
print("\n=== Phase 3: Comparative finance ===")

for i in range(1, min(len(sorted_months), 13)):
    m1 = sorted_months[-i - 1]
    m2 = sorted_months[-i]
    d1, d2 = tx_by_month[m1], tx_by_month[m2]
    exp1, exp2 = round(d1["expenses"]), round(d2["expenses"])
    inc1, inc2 = round(d1["income"]), round(d2["income"])
    diff_exp = exp2 - exp1
    diff_pct = round(diff_exp / max(exp1, 1) * 100)

    add_example([
        {"role": "system", "content": SYSTEM_QA},
        {"role": "user", "content": f"Порівняй витрати {m1} і {m2}"},
        {"role": "assistant", "content": f"Порівняння {m1} vs {m2}:\n• Витрати: {exp1} → {exp2} EUR ({'+' if diff_exp >= 0 else ''}{diff_exp}, {'+' if diff_pct >= 0 else ''}{diff_pct}%)\n• Дохід: {inc1} → {inc2} EUR\n• Баланс: {'+' if inc1 - exp1 >= 0 else ''}{round(inc1 - exp1)} → {'+' if inc2 - exp2 >= 0 else ''}{round(inc2 - exp2)} EUR"},
    ], "finance_comparison")

print(f"  → {stats['finance_comparison']} finance comparison examples")


# ============================================================
# 4. Health patterns (Garmin weekly) — extended
# ============================================================
print("\n=== Phase 4: Health patterns (Garmin) ===")

for i in range(0, min(len(garmin), 180), 7):
    week = garmin[i:i + 7]
    if not week:
        continue
    date_from = week[-1].get("date", "?")
    date_to = week[0].get("date", "?")
    steps = [safe_int(r["steps"]) for r in week if r.get("steps")]
    hr = [safe_int(r["resting_hr"]) for r in week if r.get("resting_hr")]
    bb_high = [safe_int(r["body_battery_high"]) for r in week if r.get("body_battery_high")]
    bb_low = [safe_int(r["body_battery_low"]) for r in week if r.get("body_battery_low")]
    stress = [safe_int(r["avg_stress"]) for r in week if r.get("avg_stress")]
    sleep_scores = [safe_int(r["sleep_score"]) for r in week if r.get("sleep_score")]
    vo2max = [safe_float(r.get("vo2max_running")) for r in week if r.get("vo2max_running")]
    hrv = [safe_int(r.get("hrv_last_night")) for r in week if r.get("hrv_last_night")]
    calories = [safe_int(r.get("calories_total")) for r in week if r.get("calories_total")]

    if not steps:
        continue

    avg_steps = round(sum(steps) / len(steps))
    avg_hr = round(sum(hr) / len(hr)) if hr else None
    avg_bb = round(sum(bb_high) / len(bb_high)) if bb_high else None
    avg_stress = round(sum(stress) / len(stress)) if stress else None
    avg_sleep = round(sum(sleep_scores) / len(sleep_scores)) if sleep_scores else None

    parts = [f"• Середні кроки: {avg_steps:,}/день"]
    if avg_hr:
        parts.append(f"• Пульс спокою: {avg_hr} bpm")
    if avg_bb:
        parts.append(f"• Body Battery (max): {avg_bb}%")
    if avg_stress:
        parts.append(f"• Стрес: {avg_stress}/100")
    if avg_sleep:
        parts.append(f"• Sleep Score: {avg_sleep}/100")
    if vo2max:
        parts.append(f"• VO2max: {round(sum(vo2max) / len(vo2max), 1)}")
    if hrv:
        parts.append(f"• HRV: {round(sum(hrv) / len(hrv))} мс")
    if calories:
        parts.append(f"• Калорії: {round(sum(calories) / len(calories)):,}/день")

    response = f"Тиждень {date_from} — {date_to}:\n" + "\n".join(parts)

    add_example([
        {"role": "system", "content": SYSTEM_QA},
        {"role": "user", "content": f"Як моє здоров'я за тиждень {date_from} — {date_to}?"},
        {"role": "assistant", "content": response},
    ], "health_weekly")

print(f"  → {stats['health_weekly']} health weekly examples")


# ============================================================
# 5. Sleep patterns (garmin_sleep weekly) — extended
# ============================================================
print("\n=== Phase 5: Sleep patterns ===")

for i in range(0, min(len(garmin_sleep), 180), 7):
    week = garmin_sleep[i:i + 7]
    if not week:
        continue
    date_from = week[-1].get("date", "?")
    date_to = week[0].get("date", "?")

    scores = [safe_int(r["sleep_score"]) for r in week if r.get("sleep_score")]
    durations = [safe_int(r["duration_seconds"]) for r in week if r.get("duration_seconds")]
    deep = [safe_int(r["deep_seconds"]) for r in week if r.get("deep_seconds")]
    rem = [safe_int(r["rem_seconds"]) for r in week if r.get("rem_seconds")]
    avg_hrs = [safe_int(r.get("avg_hr")) for r in week if r.get("avg_hr")]
    hrv_sleep = [safe_int(r.get("hrv_sleep")) for r in week if r.get("hrv_sleep")]
    bb_change = [safe_int(r.get("body_battery_change")) for r in week if r.get("body_battery_change")]

    if not scores or not durations:
        continue

    avg_score = round(sum(scores) / len(scores))
    avg_dur_h = round(sum(durations) / len(durations) / 3600, 1)
    avg_deep_h = round(sum(deep) / len(deep) / 3600, 1) if deep else None
    avg_rem_h = round(sum(rem) / len(rem) / 3600, 1) if rem else None

    parts = [f"• Sleep Score: {avg_score}/100", f"• Тривалість: {avg_dur_h} год"]
    if avg_deep_h:
        parts.append(f"• Глибокий сон: {avg_deep_h} год")
    if avg_rem_h:
        parts.append(f"• REM: {avg_rem_h} год")
    if avg_hrs:
        parts.append(f"• Середній пульс уві сні: {round(sum(avg_hrs) / len(avg_hrs))} bpm")
    if hrv_sleep:
        parts.append(f"• HRV уві сні: {round(sum(hrv_sleep) / len(hrv_sleep))} мс")
    if bb_change:
        parts.append(f"• Body Battery відновлення: +{round(sum(bb_change) / len(bb_change))}")

    quality = "відмінна" if avg_score >= 80 else "добра" if avg_score >= 65 else "потребує покращення"
    parts.append(f"• Якість: {quality}")

    add_example([
        {"role": "system", "content": SYSTEM_QA},
        {"role": "user", "content": f"Як мій сон за тиждень {date_from} — {date_to}?"},
        {"role": "assistant", "content": f"Сон за тиждень {date_from} — {date_to}:\n" + "\n".join(parts)},
    ], "sleep_weekly")

print(f"  → {stats['sleep_weekly']} sleep weekly examples")


# ============================================================
# 6. Mood/Daily log patterns (weekly)
# ============================================================
print("\n=== Phase 6: Mood patterns ===")

for i in range(0, min(len(daily_logs), 120), 7):
    week = daily_logs[i:i + 7]
    if not week:
        continue
    date_from = week[-1].get("date", "?")
    date_to = week[0].get("date", "?")
    moods = [safe_float(r["level"]) for r in week if r.get("level")]
    energy = [safe_float(r["energy_level"]) for r in week if r.get("energy_level")]
    stress = [safe_float(r["stress_level"]) for r in week if r.get("stress_level")]
    focus = [safe_float(r["focus_quality"]) for r in week if r.get("focus_quality")]

    if not moods:
        continue

    avg_mood = round(sum(moods) / len(moods), 1)
    avg_energy = round(sum(energy) / len(energy), 1) if energy else None
    avg_stress_l = round(sum(stress) / len(stress), 1) if stress else None
    avg_focus = round(sum(focus) / len(focus), 1) if focus else None

    mood_word = "позитивний" if avg_mood >= 2 else "нейтральний" if avg_mood >= 0 else "знижений" if avg_mood >= -3 else "поганий"

    parts = [f"• Настрій: {avg_mood}/5 ({mood_word})"]
    if avg_energy is not None:
        parts.append(f"• Енергія: {avg_energy}/5")
    if avg_stress_l is not None:
        parts.append(f"• Стрес: {avg_stress_l}/5")
    if avg_focus is not None:
        parts.append(f"• Фокус: {avg_focus}/5")

    response = f"Тиждень {date_from} — {date_to}:\n" + "\n".join(parts)

    add_example([
        {"role": "system", "content": SYSTEM_QA},
        {"role": "user", "content": f"Як мій настрій за тиждень {date_from} — {date_to}?"},
        {"role": "assistant", "content": response},
    ], "mood_weekly")

    if avg_energy is not None:
        energy_word = "висока" if avg_energy >= 4 else "нормальна" if avg_energy >= 3 else "низька"
        add_example([
            {"role": "system", "content": SYSTEM_QA},
            {"role": "user", "content": f"Яка була моя енергія {date_from} — {date_to}?"},
            {"role": "assistant", "content": f"Тиждень {date_from} — {date_to}: енергія {energy_word} ({avg_energy}/5).\nНастрій: {avg_mood}/5, стрес: {avg_stress_l}/5."},
        ], "mood_weekly_aug")

print(f"  → {stats['mood_weekly']} mood + {stats['mood_weekly_aug']} augmented")


# ============================================================
# 7. Workout patterns (gym)
# ============================================================
print("\n=== Phase 7: Workout patterns ===")

workouts_by_date = defaultdict(list)
for row in workouts:
    if row.get("date"):
        workouts_by_date[row["date"]].append(row)

sorted_dates = sorted(workouts_by_date.keys(), reverse=True)
if sorted_dates:
    week_workouts = defaultdict(list)
    for d in sorted_dates:
        dt = datetime.strptime(d, "%Y-%m-%d")
        week_start = (dt - timedelta(days=dt.weekday())).strftime("%Y-%m-%d")
        week_workouts[week_start].append(d)

    for week_start, dates in sorted(week_workouts.items(), reverse=True)[:20]:
        week_end_dt = datetime.strptime(week_start, "%Y-%m-%d") + timedelta(days=6)
        week_end = week_end_dt.strftime("%Y-%m-%d")
        num_sessions = len(dates)

        muscle_groups = set()
        exercises_done = set()
        total_sets = 0
        max_weights = defaultdict(float)
        for d in dates:
            for row in workouts_by_date[d]:
                mg = row.get("muscle_group", "")
                ex = row.get("exercise", "")
                if mg:
                    muscle_groups.add(mg)
                if ex:
                    exercises_done.add(ex)
                total_sets += 1
                w = safe_float(row.get("weight_kg"))
                if w > max_weights.get(ex, 0):
                    max_weights[ex] = w

        if not muscle_groups:
            continue

        top_weights = sorted(max_weights.items(), key=lambda x: -x[1])[:3]
        weights_str = ", ".join(f"{e}: {w}кг" for e, w in top_weights if w > 0)

        add_example([
            {"role": "system", "content": SYSTEM_QA},
            {"role": "user", "content": f"Як мої тренування за тиждень {week_start}?"},
            {"role": "assistant", "content": f"Тиждень {week_start} — {week_end}:\n• Тренувань: {num_sessions}\n• Групи м'язів: {', '.join(sorted(muscle_groups))}\n• Всього підходів: {total_sets}\n• Топ ваги: {weights_str}"},
        ], "workout_weekly")

    workouts_by_month = defaultdict(lambda: {"dates": set(), "groups": set(), "sets": 0})
    for d in sorted_dates:
        month = d[:7]
        workouts_by_month[month]["dates"].add(d)
        for row in workouts_by_date[d]:
            mg = row.get("muscle_group", "")
            if mg:
                workouts_by_month[month]["groups"].add(mg)
            workouts_by_month[month]["sets"] += 1

    for month in sorted(workouts_by_month.keys())[-12:]:
        mdata = workouts_by_month[month]
        num_sessions = len(mdata["dates"])
        if num_sessions == 0:
            continue

        add_example([
            {"role": "system", "content": SYSTEM_QA},
            {"role": "user", "content": f"Скільки я тренувався у {month}?"},
            {"role": "assistant", "content": f"У {month}: {num_sessions} тренувань, {mdata['sets']} підходів.\nГрупи м'язів: {', '.join(sorted(mdata['groups']))}."},
        ], "workout_monthly")

print(f"  → {stats['workout_weekly']} workout weekly + {stats['workout_monthly']} monthly")


# ============================================================
# 8. Garmin Activities (running, cycling, etc.)
# ============================================================
print("\n=== Phase 8: Garmin activities ===")

activities_by_week = defaultdict(list)
for row in garmin_activities:
    if not row.get("date"):
        continue
    dt = datetime.strptime(row["date"][:10], "%Y-%m-%d")
    week_start = (dt - timedelta(days=dt.weekday())).strftime("%Y-%m-%d")
    activities_by_week[week_start].append(row)

for week_start in sorted(activities_by_week.keys(), reverse=True)[:20]:
    acts = activities_by_week[week_start]
    week_end = (datetime.strptime(week_start, "%Y-%m-%d") + timedelta(days=6)).strftime("%Y-%m-%d")

    by_type = defaultdict(list)
    for a in acts:
        atype = a.get("activity_type", "unknown")
        by_type[atype].append(a)

    parts = [f"• Активностей: {len(acts)}"]
    for atype, type_acts in by_type.items():
        total_dur = sum(safe_int(a.get("duration_seconds")) for a in type_acts)
        total_cal = sum(safe_int(a.get("calories")) for a in type_acts)
        total_dist = sum(safe_float(a.get("distance_m")) for a in type_acts)
        avg_hr = [safe_int(a.get("avg_hr")) for a in type_acts if a.get("avg_hr")]

        line = f"• {atype}: {len(type_acts)}x, {round(total_dur / 60)} хв"
        if total_dist > 0:
            line += f", {round(total_dist / 1000, 1)} км"
        if total_cal > 0:
            line += f", {total_cal} kcal"
        if avg_hr:
            line += f", avg HR {round(sum(avg_hr) / len(avg_hr))}"
        parts.append(line)

    add_example([
        {"role": "system", "content": SYSTEM_QA},
        {"role": "user", "content": f"Які мої активності за тиждень {week_start}?"},
        {"role": "assistant", "content": f"Активності {week_start} — {week_end}:\n" + "\n".join(parts)},
    ], "garmin_activities_weekly")

print(f"  → {stats['garmin_activities_weekly']} garmin activities weekly")


# ============================================================
# 9. Body Composition trends
# ============================================================
print("\n=== Phase 9: Body composition ===")

if body_composition:
    # Monthly body composition
    bc_by_month = defaultdict(list)
    for row in body_composition:
        if row.get("date") and row.get("weight"):
            bc_by_month[row["date"][:7]].append(row)

    for month in sorted(bc_by_month.keys())[-12:]:
        rows = bc_by_month[month]
        weights = [safe_float(r["weight"]) for r in rows if r.get("weight")]
        fat_pcts = [safe_float(r["body_fat_pct"]) for r in rows if r.get("body_fat_pct")]
        muscle = [safe_float(r["muscle_mass"]) for r in rows if r.get("muscle_mass")]

        if not weights:
            continue

        avg_w = round(sum(weights) / len(weights), 1)
        parts = [f"• Вага: {avg_w} кг"]
        if fat_pcts:
            parts.append(f"• Жир: {round(sum(fat_pcts) / len(fat_pcts), 1)}%")
        if muscle:
            parts.append(f"• М'язова маса: {round(sum(muscle) / len(muscle), 1)} кг")
        if rows[0].get("bmi"):
            parts.append(f"• BMI: {round(safe_float(rows[0]['bmi']), 1)}")
        if rows[0].get("metabolic_age"):
            parts.append(f"• Метаболічний вік: {rows[0]['metabolic_age']}")

        add_example([
            {"role": "system", "content": SYSTEM_QA},
            {"role": "user", "content": f"Яка моя вага та склад тіла за {month}?"},
            {"role": "assistant", "content": f"Склад тіла за {month} ({len(rows)} вимірювань):\n" + "\n".join(parts)},
        ], "body_composition")

    # Weight trend (3-month comparison)
    bc_months_sorted = sorted(bc_by_month.keys())
    for i in range(2, min(len(bc_months_sorted), 8)):
        m1, m2 = bc_months_sorted[i - 2], bc_months_sorted[i]
        w1 = [safe_float(r["weight"]) for r in bc_by_month[m1] if r.get("weight")]
        w2 = [safe_float(r["weight"]) for r in bc_by_month[m2] if r.get("weight")]
        if w1 and w2:
            avg1, avg2 = round(sum(w1) / len(w1), 1), round(sum(w2) / len(w2), 1)
            diff = round(avg2 - avg1, 1)
            trend = "набрав" if diff > 0 else "скинув" if diff < 0 else "стабільна"
            add_example([
                {"role": "system", "content": SYSTEM_QA},
                {"role": "user", "content": f"Як змінилася моя вага з {m1} по {m2}?"},
                {"role": "assistant", "content": f"Тренд ваги {m1} → {m2}: {avg1} → {avg2} кг ({'+' if diff > 0 else ''}{diff} кг). Ти {trend} {abs(diff)} кг за цей період."},
            ], "weight_trend")

print(f"  → {stats['body_composition']} body composition + {stats['weight_trend']} weight trend")


# ============================================================
# 10. Investment portfolio
# ============================================================
print("\n=== Phase 10: Investments ===")

if investments:
    # Portfolio overview
    by_broker = defaultdict(lambda: {"positions": [], "total_value": 0, "total_pnl": 0})
    for row in investments:
        broker = row.get("broker", "unknown")
        mv = safe_float(row.get("market_value"))
        pnl = safe_float(row.get("unrealized_pnl"))
        by_broker[broker]["positions"].append(row)
        by_broker[broker]["total_value"] += mv
        by_broker[broker]["total_pnl"] += pnl

    total_nav = sum(b["total_value"] for b in by_broker.values())
    total_pnl = sum(b["total_pnl"] for b in by_broker.values())

    broker_parts = []
    for broker, bdata in sorted(by_broker.items()):
        broker_parts.append(f"• {broker}: {round(bdata['total_value'])} EUR ({len(bdata['positions'])} позицій, PnL: {'+' if bdata['total_pnl'] >= 0 else ''}{round(bdata['total_pnl'])} EUR)")

    add_example([
        {"role": "system", "content": SYSTEM_QA},
        {"role": "user", "content": "Який стан моїх інвестицій?"},
        {"role": "assistant", "content": f"Портфель: {round(total_nav)} EUR\nPnL: {'+' if total_pnl >= 0 else ''}{round(total_pnl)} EUR\n\nПо брокерах:\n" + "\n".join(broker_parts)},
    ], "investments_overview")

    add_example([
        {"role": "system", "content": SYSTEM_QA},
        {"role": "user", "content": "Скільки у мене інвестовано?"},
        {"role": "assistant", "content": f"Загальний NAV портфеля: {round(total_nav)} EUR через {len(by_broker)} брокерів ({', '.join(by_broker.keys())}). Нереалізований PnL: {'+' if total_pnl >= 0 else ''}{round(total_pnl)} EUR."},
    ], "investments_overview")

    # Top positions
    positions_sorted = sorted(investments, key=lambda x: safe_float(x.get("market_value")), reverse=True)
    top10 = positions_sorted[:10]
    top_parts = []
    for p in top10:
        mv = round(safe_float(p.get("market_value")))
        pnl = round(safe_float(p.get("unrealized_pnl")))
        top_parts.append(f"• {p.get('symbol', '?')} ({p.get('name', '')}): {mv} EUR, PnL {'+' if pnl >= 0 else ''}{pnl} EUR [{p.get('broker', '')}]")

    add_example([
        {"role": "system", "content": SYSTEM_QA},
        {"role": "user", "content": "Які мої найбільші позиції?"},
        {"role": "assistant", "content": f"Топ-10 позицій за вартістю:\n" + "\n".join(top_parts)},
    ], "investments_top")

    # Winners/losers
    winners = sorted(investments, key=lambda x: safe_float(x.get("unrealized_pnl")), reverse=True)[:5]
    losers = sorted(investments, key=lambda x: safe_float(x.get("unrealized_pnl")))[:5]

    w_parts = [f"• {p['symbol']}: {'+' if safe_float(p.get('unrealized_pnl')) >= 0 else ''}{round(safe_float(p.get('unrealized_pnl')))} EUR" for p in winners]
    l_parts = [f"• {p['symbol']}: {round(safe_float(p.get('unrealized_pnl')))} EUR" for p in losers if safe_float(p.get("unrealized_pnl")) < 0]

    if w_parts:
        add_example([
            {"role": "system", "content": SYSTEM_QA},
            {"role": "user", "content": "Які акції приносять найбільше?"},
            {"role": "assistant", "content": f"Найкращі позиції по PnL:\n" + "\n".join(w_parts)},
        ], "investments_winners")

    if l_parts:
        add_example([
            {"role": "system", "content": SYSTEM_QA},
            {"role": "user", "content": "Які акції в мінусі?"},
            {"role": "assistant", "content": f"Позиції зі збитком:\n" + "\n".join(l_parts)},
        ], "investments_losers")

    # By asset class
    by_class = defaultdict(float)
    for p in investments:
        ac = p.get("asset_class", "Other")
        by_class[ac] += safe_float(p.get("market_value"))

    if by_class:
        class_parts = [f"• {ac}: {round(v)} EUR ({round(v / max(total_nav, 1) * 100)}%)" for ac, v in sorted(by_class.items(), key=lambda x: -x[1])]
        add_example([
            {"role": "system", "content": SYSTEM_QA},
            {"role": "user", "content": "Яка структура мого портфеля?"},
            {"role": "assistant", "content": f"Розподіл по класах активів (NAV {round(total_nav)} EUR):\n" + "\n".join(class_parts)},
        ], "investments_allocation")

print(f"  → {stats['investments_overview']} overview + {stats['investments_top']} top + {stats['investments_winners']} winners + {stats['investments_losers']} losers + {stats['investments_allocation']} allocation")


# ============================================================
# 11. Portfolio NAV trends
# ============================================================
print("\n=== Phase 11: Portfolio trends ===")

if portfolio:
    # Monthly portfolio snapshots
    port_by_month = defaultdict(list)
    for row in portfolio:
        if row.get("date"):
            port_by_month[row["date"][:7]].append(row)

    port_months = sorted(port_by_month.keys())
    for month in port_months[-12:]:
        rows = port_by_month[month]
        last = rows[0]
        nav = round(safe_float(last.get("total_nav")))
        pnl = round(safe_float(last.get("total_pnl")))
        cash = round(safe_float(last.get("cash_eur")))
        invested = round(safe_float(last.get("invested_eur")))

        add_example([
            {"role": "system", "content": SYSTEM_QA},
            {"role": "user", "content": f"Який мій портфель за {month}?"},
            {"role": "assistant", "content": f"Портфель на кінець {month}:\n• NAV: {nav} EUR\n• Інвестовано: {invested} EUR\n• Кеш: {cash} EUR\n• PnL: {'+' if pnl >= 0 else ''}{pnl} EUR"},
        ], "portfolio_monthly")

    # NAV trend comparison
    for i in range(1, min(len(port_months), 7)):
        m1, m2 = port_months[-i - 1], port_months[-i]
        nav1 = safe_float(port_by_month[m1][0].get("total_nav"))
        nav2 = safe_float(port_by_month[m2][0].get("total_nav"))
        diff = round(nav2 - nav1)
        pct = round(diff / max(nav1, 1) * 100, 1)

        add_example([
            {"role": "system", "content": SYSTEM_QA},
            {"role": "user", "content": f"Як змінився мій портфель з {m1} по {m2}?"},
            {"role": "assistant", "content": f"NAV портфеля: {round(nav1)} → {round(nav2)} EUR ({'+' if diff >= 0 else ''}{diff} EUR, {'+' if pct >= 0 else ''}{pct}%)."},
        ], "portfolio_trend")

print(f"  → {stats['portfolio_monthly']} monthly + {stats['portfolio_trend']} trend")


# ============================================================
# 12. Cross-domain daily examples
# ============================================================
print("\n=== Phase 12: Cross-domain daily ===")

garmin_by_date = {r["date"]: r for r in garmin if r.get("date")}
logs_by_date = {r["date"]: r for r in daily_logs if r.get("date")}
sleep_by_date = {r["date"]: r for r in garmin_sleep if r.get("date")}

all_dates = sorted(set(garmin_by_date.keys()) & set(logs_by_date.keys()), reverse=True)

for d in all_dates[:30]:
    g = garmin_by_date.get(d, {})
    l = logs_by_date.get(d, {})
    s = sleep_by_date.get(d, {})

    parts = []
    if l.get("level"):
        mood_val = safe_float(l["level"])
        mood_word = "позитивний" if mood_val >= 2 else "нейтральний" if mood_val >= 0 else "знижений"
        parts.append(f"• Настрій: {mood_val} ({mood_word})")
    if l.get("energy_level"):
        parts.append(f"• Енергія: {l['energy_level']}/5")
    if g.get("steps"):
        parts.append(f"• Кроки: {safe_int(g['steps']):,}")
    if g.get("resting_hr"):
        parts.append(f"• Пульс спокою: {g['resting_hr']} bpm")
    if g.get("body_battery_high"):
        parts.append(f"• Body Battery: {g['body_battery_low']}–{g['body_battery_high']}")
    if s.get("sleep_score"):
        dur_h = round(safe_int(s["duration_seconds"]) / 3600, 1) if s.get("duration_seconds") else "?"
        parts.append(f"• Сон: score {s['sleep_score']}, {dur_h} год")

    if len(parts) >= 3:
        add_example([
            {"role": "system", "content": SYSTEM_QA},
            {"role": "user", "content": f"Як пройшов мій день {d}?"},
            {"role": "assistant", "content": f"День {d}:\n" + "\n".join(parts)},
        ], "cross_domain_daily")

print(f"  → {stats['cross_domain_daily']} cross-domain daily examples")


# ============================================================
# 13. Multi-turn dialogues (30+ conversations)
# ============================================================
print("\n=== Phase 13: Multi-turn dialogues ===")

# --- 13a. Finance multi-turn (10 dialogues) ---

# Dialogue 1: "Скільки я витратив?" → "А на що найбільше?" → "Порівняй з минулим місяцем"
if len(sorted_months) >= 2:
    for idx in range(min(3, len(sorted_months) - 1)):
        m_cur = sorted_months[-(1 + idx)]
        m_prev = sorted_months[-(2 + idx)]
        cur_data = tx_by_month[m_cur]
        prev_data = tx_by_month[m_prev]
        cur_exp = round(cur_data["expenses"])
        prev_exp = round(prev_data["expenses"])
        top_cats_cur = sorted(cur_data["categories"].items(), key=lambda x: -x[1])
        if not top_cats_cur:
            continue
        biggest_cat = top_cats_cur[0][0]
        biggest_amt = round(top_cats_cur[0][1])
        cats_str = ", ".join(f"{c}: {round(a)} EUR" for c, a in top_cats_cur[:5])
        diff = cur_exp - prev_exp
        diff_pct = round(diff / max(prev_exp, 1) * 100)
        prev_cat_amt = round(prev_data["categories"].get(biggest_cat, 0))

        add_example([
            {"role": "system", "content": SYSTEM_QA},
            {"role": "user", "content": f"Скільки я витратив у {m_cur}?"},
            {"role": "assistant", "content": f"За {m_cur} ти витратив {cur_exp} EUR ({cur_data['count']} транзакцій)."},
            {"role": "user", "content": "А на що найбільше?"},
            {"role": "assistant", "content": f"Топ категорії за {m_cur}:\n{cats_str}\nНайбільша: {biggest_cat} — {biggest_amt} EUR."},
            {"role": "user", "content": "Порівняй з минулим місяцем"},
            {"role": "assistant", "content": f"Порівняння {m_prev} vs {m_cur}:\n• Загальні витрати: {prev_exp} → {cur_exp} EUR ({'+' if diff >= 0 else ''}{diff} EUR, {'+' if diff_pct >= 0 else ''}{diff_pct}%)\n• {biggest_cat}: {prev_cat_amt} → {biggest_amt} EUR\n{'Витрати зросли' if diff > 0 else 'Витрати зменшились' if diff < 0 else 'Витрати стабільні'}."},
        ], "multi_turn_finance")

# Dialogue 2: "Який мій бюджет?" → "Чи я в межах?" → "Де можна зекономити?"
if sorted_months:
    for idx in range(min(3, len(sorted_months))):
        m = sorted_months[-(1 + idx)]
        mdata = tx_by_month[m]
        exp = round(mdata["expenses"])
        inc = round(mdata["income"])
        bal = inc - exp
        top_cats = sorted(mdata["categories"].items(), key=lambda x: -x[1])
        if not top_cats or len(top_cats) < 3:
            continue
        all_exp = [round(tx_by_month[mo]["expenses"]) for mo in sorted_months]
        avg_exp = round(sum(all_exp) / len(all_exp))
        over_under = exp - avg_exp
        discretionary = [c for c, a in top_cats if c.lower() not in ("housing", "rent", "житло", "оренда", "utilities", "комунальні")]
        savings_cats = [(c, round(a)) for c, a in top_cats if c in discretionary][:3]
        savings_str = ", ".join(f"{c} ({a} EUR)" for c, a in savings_cats)

        add_example([
            {"role": "system", "content": SYSTEM_QA},
            {"role": "user", "content": f"Який мій бюджет за {m}?"},
            {"role": "assistant", "content": f"За {m}: дохід {inc} EUR, витрати {exp} EUR, баланс {'+' if bal >= 0 else ''}{bal} EUR."},
            {"role": "user", "content": "Чи я в межах?"},
            {"role": "assistant", "content": f"Твій середній рівень витрат: {avg_exp} EUR/міс. За {m} витрати {exp} EUR — {'в межах норми' if abs(over_under) < avg_exp * 0.15 else 'вище за середнє на ' + str(over_under) + ' EUR' if over_under > 0 else 'нижче за середнє на ' + str(abs(over_under)) + ' EUR'}."},
            {"role": "user", "content": "Де можна зекономити?"},
            {"role": "assistant", "content": f"Потенціал для економії — дискреційні категорії:\n{savings_str}\nРекомендація: встанови ліміт на найбільшу категорію та відстежуй щотижня."},
        ], "multi_turn_finance")

# Dialogue 3: "Покажи доходи" → "А витрати?" → "Який баланс?"
if len(sorted_months) >= 3:
    for idx in range(min(4, len(sorted_months) - 2)):
        m = sorted_months[-(1 + idx)]
        mdata = tx_by_month[m]
        inc = round(mdata["income"])
        exp = round(mdata["expenses"])
        bal = inc - exp
        top_cats = sorted(mdata["categories"].items(), key=lambda x: -x[1])[:5]
        cats_str = ", ".join(f"{c}: {round(a)} EUR" for c, a in top_cats)
        savings_rate = round(bal / max(inc, 1) * 100)

        add_example([
            {"role": "system", "content": SYSTEM_QA},
            {"role": "user", "content": f"Покажи мої доходи за {m}"},
            {"role": "assistant", "content": f"Дохід за {m}: {inc} EUR."},
            {"role": "user", "content": "А витрати?"},
            {"role": "assistant", "content": f"Витрати за {m}: {exp} EUR ({mdata['count']} транзакцій).\nТоп: {cats_str}"},
            {"role": "user", "content": "Який баланс?"},
            {"role": "assistant", "content": f"Баланс за {m}: {'+' if bal >= 0 else ''}{bal} EUR.\n{'Ти зберіг ' + str(savings_rate) + '% доходу.' if bal > 0 else 'Витрати перевищили дохід на ' + str(abs(bal)) + ' EUR.'}"},
        ], "multi_turn_finance")

# --- 13b. Health multi-turn (10 dialogues) ---

def garmin_week_avg(week_data):
    """Compute average health metrics for a list of garmin day records."""
    steps = [safe_int(r["steps"]) for r in week_data if r.get("steps")]
    hr = [safe_int(r["resting_hr"]) for r in week_data if r.get("resting_hr")]
    stress = [safe_int(r["avg_stress"]) for r in week_data if r.get("avg_stress")]
    bb_high = [safe_int(r["body_battery_high"]) for r in week_data if r.get("body_battery_high")]
    bb_low = [safe_int(r["body_battery_low"]) for r in week_data if r.get("body_battery_low")]
    sleep_scores = [safe_int(r["sleep_score"]) for r in week_data if r.get("sleep_score")]
    return {
        "steps": round(sum(steps) / len(steps)) if steps else None,
        "hr": round(sum(hr) / len(hr)) if hr else None,
        "stress": round(sum(stress) / len(stress)) if stress else None,
        "bb_high": round(sum(bb_high) / len(bb_high)) if bb_high else None,
        "bb_low": round(sum(bb_low) / len(bb_low)) if bb_low else None,
        "sleep": round(sum(sleep_scores) / len(sleep_scores)) if sleep_scores else None,
    }

_garmin_weeks = defaultdict(list)
for r in garmin:
    if r.get("date"):
        _dt = datetime.strptime(r["date"], "%Y-%m-%d")
        _ws = (_dt - timedelta(days=_dt.weekday())).strftime("%Y-%m-%d")
        _garmin_weeks[_ws].append(r)
_sorted_gw = sorted(_garmin_weeks.keys(), reverse=True)

# Dialogue 4: "Як мій пульс?" → "А стрес?" → "Що робити щоб знизити?"
for idx in range(min(3, len(_sorted_gw))):
    wk = _sorted_gw[idx]
    avg = garmin_week_avg(_garmin_weeks[wk])
    if avg["hr"] is None or avg["stress"] is None:
        continue

    stress_level = "високий" if avg["stress"] >= 40 else "помірний" if avg["stress"] >= 25 else "низький"
    hr_status = "підвищений" if avg["hr"] >= 65 else "нормальний" if avg["hr"] >= 55 else "низький (добре)"

    add_example([
        {"role": "system", "content": SYSTEM_QA},
        {"role": "user", "content": f"Як мій пульс за тиждень {wk}?"},
        {"role": "assistant", "content": f"Середній пульс спокою за тиждень {wk}: {avg['hr']} bpm — {hr_status}."},
        {"role": "user", "content": "А стрес?"},
        {"role": "assistant", "content": f"Середній стрес за тиждень: {avg['stress']}/100 — {stress_level}.{' Стрес корелює з підвищеним пульсом.' if avg['stress'] >= 35 and avg['hr'] >= 62 else ''}"},
        {"role": "user", "content": "Що робити щоб знизити?"},
        {"role": "assistant", "content": "Рекомендації для зниження стресу:\n• Дихальні вправи (4-7-8) перед сном\n• Прогулянки на свіжому повітрі 30+ хв\n• Обмеж кофеїн після 14:00\n• Медитація 10 хв/день\n• Регулярні тренування знижують базовий рівень стресу на 15-20%."},
    ], "multi_turn_health")

# Dialogue 5: "Як я спав?" → "Порівняй з минулим тижнем" → "Що впливає на сон?"
sleep_by_week = defaultdict(list)
for r in garmin_sleep:
    if r.get("date"):
        _dt = datetime.strptime(r["date"], "%Y-%m-%d")
        _ws = (_dt - timedelta(days=_dt.weekday())).strftime("%Y-%m-%d")
        sleep_by_week[_ws].append(r)
_sorted_sw = sorted(sleep_by_week.keys(), reverse=True)

for idx in range(min(3, len(_sorted_sw) - 1)):
    wk_cur = _sorted_sw[idx]
    wk_prev = _sorted_sw[idx + 1]
    cur_sleep = sleep_by_week[wk_cur]
    prev_sleep = sleep_by_week[wk_prev]

    cur_scores = [safe_int(r["sleep_score"]) for r in cur_sleep if r.get("sleep_score")]
    prev_scores = [safe_int(r["sleep_score"]) for r in prev_sleep if r.get("sleep_score")]
    cur_dur = [safe_int(r["duration_seconds"]) for r in cur_sleep if r.get("duration_seconds")]
    prev_dur = [safe_int(r["duration_seconds"]) for r in prev_sleep if r.get("duration_seconds")]
    cur_deep = [safe_int(r["deep_seconds"]) for r in cur_sleep if r.get("deep_seconds")]

    if not cur_scores or not prev_scores or not cur_dur:
        continue

    avg_cur_score = round(sum(cur_scores) / len(cur_scores))
    avg_prev_score = round(sum(prev_scores) / len(prev_scores))
    avg_cur_dur = round(sum(cur_dur) / len(cur_dur) / 3600, 1)
    avg_prev_dur = round(sum(prev_dur) / len(prev_dur) / 3600, 1) if prev_dur else None
    avg_deep_h = round(sum(cur_deep) / len(cur_deep) / 3600, 1) if cur_deep else None
    score_diff = avg_cur_score - avg_prev_score
    quality = "покращився" if score_diff > 3 else "погіршився" if score_diff < -3 else "стабільний"

    deep_comment = ""
    if avg_deep_h is not None:
        deep_comment = f"\n• Глибокий сон: {avg_deep_h} год {'(достатньо)' if avg_deep_h >= 1.0 else '(мало — потрібно 1-1.5 год)'}"

    add_example([
        {"role": "system", "content": SYSTEM_QA},
        {"role": "user", "content": f"Як я спав цей тиждень ({wk_cur})?"},
        {"role": "assistant", "content": f"Сон за тиждень {wk_cur}:\n• Sleep Score: {avg_cur_score}/100\n• Тривалість: {avg_cur_dur} год{deep_comment}"},
        {"role": "user", "content": "Порівняй з минулим тижнем"},
        {"role": "assistant", "content": f"Порівняння сну {wk_prev} vs {wk_cur}:\n• Score: {avg_prev_score} → {avg_cur_score} ({'+' if score_diff >= 0 else ''}{score_diff})\n• Тривалість: {avg_prev_dur} → {avg_cur_dur} год\nСон {quality}."},
        {"role": "user", "content": "Що впливає на сон?"},
        {"role": "assistant", "content": f"Основні фактори якості сну:\n• Час засинання: оптимально 22:30-23:30\n• Кофеїн: не пізніше 14:00\n• Екрани: вимкнути за 1 год до сну\n• Фізична активність: помірні тренування покращують сон, але не пізно ввечері\n• Стрес: високий стрес ({avg_cur_score < 65 and 'твій score нижчий за норму — можливо через стрес' or 'твій score в нормі'})"},
    ], "multi_turn_health")

# Dialogue 6: "Покажи Body Battery" → "Чому низький/такий?" → "Як підвищити?"
for idx in range(min(4, len(_sorted_gw))):
    wk = _sorted_gw[idx]
    wk_data = _garmin_weeks[wk]
    avg = garmin_week_avg(wk_data)
    if avg["bb_high"] is None or avg["bb_low"] is None:
        continue

    bb_range = avg["bb_high"] - avg["bb_low"]
    bb_status = "низький" if avg["bb_high"] < 60 else "середній" if avg["bb_high"] < 80 else "високий"

    wk_sleep = sleep_by_week.get(wk, [])
    sleep_scores_wk = [safe_int(r["sleep_score"]) for r in wk_sleep if r.get("sleep_score")]
    avg_sleep_wk = round(sum(sleep_scores_wk) / len(sleep_scores_wk)) if sleep_scores_wk else None

    low_reasons = []
    if avg["stress"] and avg["stress"] >= 35:
        low_reasons.append(f"високий стрес ({avg['stress']}/100)")
    if avg_sleep_wk and avg_sleep_wk < 65:
        low_reasons.append(f"недостатній сон (score {avg_sleep_wk})")
    if avg["hr"] and avg["hr"] >= 65:
        low_reasons.append(f"підвищений пульс ({avg['hr']} bpm)")
    if not low_reasons:
        low_reasons.append("можливо недостатнє відновлення між активностями")

    add_example([
        {"role": "system", "content": SYSTEM_QA},
        {"role": "user", "content": f"Покажи мій Body Battery за тиждень {wk}"},
        {"role": "assistant", "content": f"Body Battery за тиждень {wk}:\n• Максимум: {avg['bb_high']}%\n• Мінімум: {avg['bb_low']}%\n• Діапазон: {bb_range}%\n• Статус: {bb_status}"},
        {"role": "user", "content": "Чому він такий?" if bb_status != "низький" else "Чому він низький?"},
        {"role": "assistant", "content": f"{'Body Battery низький через: ' if avg['bb_high'] < 70 else 'Body Battery на рівні ' + bb_status + '. '}" + (", ".join(low_reasons) if avg["bb_high"] < 70 else f"Твій стрес {avg['stress']}/100, сон {'score ' + str(avg_sleep_wk) if avg_sleep_wk else 'без даних'}. Це впливає на відновлення.") + "."},
        {"role": "user", "content": "Як підвищити Body Battery?"},
        {"role": "assistant", "content": "Щоб підвищити Body Battery:\n• Спи 7-8 годин з якісним глибоким сном\n• Знижуй стрес: дихальні вправи, прогулянки\n• Уникай алкоголю — він різко знижує нічне відновлення\n• Плануй інтенсивні тренування на дні з високим BB (>70%)\n• Роби day off від тренувань якщо BB < 30%"},
    ], "multi_turn_health")

# --- 13c. Cross-domain multi-turn (5 dialogues) ---

# Dialogue 7: "Чому я почуваюся гірше?" → combine sleep + mood + gym + stress
for d in all_dates[:5]:
    g = garmin_by_date.get(d, {})
    l = logs_by_date.get(d, {})
    s = sleep_by_date.get(d, {})

    mood_val = safe_float(l.get("level", 0))
    energy_val = safe_float(l.get("energy_level", 0))
    stress_val = safe_int(g.get("avg_stress", 0))
    sleep_score = safe_int(s.get("sleep_score", 0))
    bb_high = safe_int(g.get("body_battery_high", 0))
    steps = safe_int(g.get("steps", 0))

    if not mood_val and not energy_val:
        continue

    factors = []
    if sleep_score and sleep_score < 65:
        factors.append(f"поганий сон (score {sleep_score})")
    if stress_val and stress_val >= 35:
        factors.append(f"підвищений стрес ({stress_val}/100)")
    if bb_high and bb_high < 50:
        factors.append(f"низький Body Battery ({bb_high}%)")
    if steps and steps < 4000:
        factors.append(f"мало руху ({steps:,} кроків)")
    if not factors:
        factors.append("дані не показують явних негативних факторів")

    workout_day = workouts_by_date.get(d, [])
    gym_comment = f"Тренування: так ({len(workout_day)} вправ)" if workout_day else "Тренування: ні"

    add_example([
        {"role": "system", "content": SYSTEM_QA},
        {"role": "user", "content": f"Чому я почуваюся гірше {d}?"},
        {"role": "assistant", "content": f"Аналіз дня {d}:\n• Настрій: {mood_val}/5\n• Енергія: {energy_val}/5\n• Сон: score {sleep_score}\n• Стрес: {stress_val}/100\n• Body Battery: {bb_high}%\n• {gym_comment}"},
        {"role": "user", "content": "Що найбільше впливає?"},
        {"role": "assistant", "content": f"Ймовірні причини: {', '.join(factors)}.\nЗвʼязок: поганий сон → низький BB → менше енергії → гірший настрій. Це каскадний ефект."},
        {"role": "user", "content": "Що порадиш?"},
        {"role": "assistant", "content": f"Рекомендації:\n• {'Покращ сон: лягай до 23:00, без екранів за годину' if sleep_score and sleep_score < 65 else 'Сон нормальний, фокусуйся на інших факторах'}\n• {'Знизь стрес: дихальні вправи, прогулянка 30 хв' if stress_val >= 35 else 'Стрес в нормі'}\n• {'Додай легку активність: прогулянка або розтяжка' if steps < 5000 else 'Фізична активність достатня'}\n• Пий більше води, обідай без телефона"},
    ], "multi_turn_cross_domain")

# Dialogue 8: "Як мій стиль життя впливає на здоров'я?" → lifestyle + garmin + sleep
if len(all_dates) >= 14:
    two_weeks = all_dates[:14]
    g_data = [garmin_by_date[d] for d in two_weeks if d in garmin_by_date]
    l_data = [logs_by_date[d] for d in two_weeks if d in logs_by_date]
    s_data = [sleep_by_date[d] for d in two_weeks if d in sleep_by_date]

    avg_mood_2w = round(sum(safe_float(r.get("level", 0)) for r in l_data) / max(len(l_data), 1), 1)
    avg_energy_2w = round(sum(safe_float(r.get("energy_level", 0)) for r in l_data) / max(len(l_data), 1), 1)
    avg_stress_2w = round(sum(safe_int(r.get("avg_stress", 0)) for r in g_data) / max(len(g_data), 1))
    avg_steps_2w = round(sum(safe_int(r.get("steps", 0)) for r in g_data) / max(len(g_data), 1))
    avg_sleep_2w = round(sum(safe_int(r.get("sleep_score", 0)) for r in s_data) / max(len(s_data), 1))

    workout_days_in_window = sum(1 for d in two_weeks if d in workouts_by_date)

    add_example([
        {"role": "system", "content": SYSTEM_QA},
        {"role": "user", "content": "Як мій стиль життя впливає на здоров'я?"},
        {"role": "assistant", "content": f"Аналіз за останні 2 тижні ({two_weeks[-1]} — {two_weeks[0]}):\n• Середній настрій: {avg_mood_2w}/5\n• Енергія: {avg_energy_2w}/5\n• Стрес: {avg_stress_2w}/100\n• Сон: score {avg_sleep_2w}\n• Кроки: {avg_steps_2w:,}/день\n• Тренувань: {workout_days_in_window} за 14 днів"},
        {"role": "user", "content": "Що можна покращити?"},
        {"role": "assistant", "content": f"Зони для покращення:\n• {'Сон: score нижче 70, потрібен стабільніший режим' if avg_sleep_2w < 70 else 'Сон: в нормі, продовжуй так'}\n• {'Рух: менше 6000 кроків/день — додай прогулянки' if avg_steps_2w < 6000 else 'Рух: достатній'}\n• {'Стрес: вище 35 — потрібні техніки релаксації' if avg_stress_2w > 35 else 'Стрес: контрольований'}\n• {'Тренування: менше 3/тиждень — додай ще одне' if workout_days_in_window < 4 else 'Тренування: регулярні'}"},
        {"role": "user", "content": "Який найважливіший фактор?"},
        {"role": "assistant", "content": f"Найважливіший фактор — сон. Він впливає на все: настрій, енергію, стрес, відновлення після тренувань. Твій середній Sleep Score {avg_sleep_2w} — {'потребує покращення. Фокусуйся на режимі та гігієні сну.' if avg_sleep_2w < 70 else 'непоганий, але є простір для росту до 80+.'}"},
    ], "multi_turn_cross_domain")

# --- 13d. Refusal examples (5 dialogues) ---

refusal_dialogues = [
    (
        "Яка погода завтра?",
        "Я не маю даних про погоду. Я працюю з твоїми персональними даними — фінанси, здоров'я, тренування, сон, настрій. Для погоди використовуй стандартний додаток.",
        "А новини?",
        "Теж поза моєю зоною. Я аналізую тільки твої дані з дашборду: транзакції, Garmin, тренування, настрій. Запитай мене щось про це!"
    ),
    (
        "Порівняй мене з іншими людьми",
        "Я маю доступ тільки до твоїх персональних даних. Я не можу порівнювати з іншими — це було б і некоректно, і ненадійно. Можу порівняти твої поточні показники з твоїми ж минулими результатами.",
        "А які середні значення?",
        "Можу орієнтовно: середній пульс спокою для чоловіків 30-40 років — 60-75 bpm, Sleep Score 70+ вважається добрим. Але найкорисніше — порівнювати себе з собою вчора/тиждень/місяць тому."
    ),
    (
        "Що буде з моїми фінансами через рік?",
        "Я аналізую історичні дані, прогнози на рік вперед ненадійні. Можу показати тренди: як змінювались твої витрати та доходи за останні місяці, і ти сам зробиш висновки.",
        "Хоча б приблизно?",
        "Якщо тренд останніх 3 місяців збережеться — можу екстраполювати. Але це не прогноз, а проекція. Зовнішні фактори (зміна роботи, переїзд, інфляція) змінять все. Краще фокусуйся на щомісячному бюджеті."
    ),
    (
        "Порекомендуй акції для покупки",
        "Я не даю інвестиційних рекомендацій — це потребує ліцензії та врахування ринкових факторів, яких я не маю. Можу показати стан твого поточного портфеля, PnL та розподіл по класах активів.",
        "А які в мене акції ростуть?",
        "Це можу! Подивися топ позицій по PnL в дашборді — там є сортування по нереалізованому прибутку."
    ),
    (
        "Напиши мені програму тренувань",
        "Я аналізую твої тренування, але не складаю програми — це робота тренера. Можу показати: які групи м'язів ти тренуєш найчастіше, як росте навантаження, чи є дисбаланс.",
        "Тоді що я треную найменше?",
        "Давай подивимося твою статистику по групах м'язів — перевір розділ 'Зал' в дашборді. Якщо якась група відстає, це сигнал для тренера."
    ),
]

for rd in refusal_dialogues:
    add_example([
        {"role": "system", "content": SYSTEM_QA},
        {"role": "user", "content": rd[0]},
        {"role": "assistant", "content": rd[1]},
        {"role": "user", "content": rd[2]},
        {"role": "assistant", "content": rd[3]},
    ], "multi_turn_refusal")

# --- 13e. Topic change dialogues (5 dialogues) ---

if sorted_months and garmin:
    for idx in range(min(3, len(sorted_months), len(_sorted_gw))):
        m = sorted_months[-(1 + idx)]
        mdata = tx_by_month[m]
        exp = round(mdata["expenses"])
        inc = round(mdata["income"])
        wk = _sorted_gw[idx] if idx < len(_sorted_gw) else None
        if not wk:
            continue
        avg = garmin_week_avg(_garmin_weeks[wk])
        if avg["steps"] is None or avg["hr"] is None:
            continue

        top_cats = sorted(mdata["categories"].items(), key=lambda x: -x[1])[:3]
        cats_str = ", ".join(f"{c}: {round(a)} EUR" for c, a in top_cats)

        add_example([
            {"role": "system", "content": SYSTEM_QA},
            {"role": "user", "content": f"Скільки я витратив у {m}?"},
            {"role": "assistant", "content": f"За {m}: {exp} EUR витрат, {inc} EUR доходу.\nТоп: {cats_str}"},
            {"role": "user", "content": "А як моє здоров'я?"},
            {"role": "assistant", "content": f"За тиждень {wk}: кроки {avg['steps']:,}/день, пульс {avg['hr']} bpm{', стрес ' + str(avg['stress']) + '/100' if avg['stress'] else ''}{', Body Battery до ' + str(avg['bb_high']) + '%' if avg['bb_high'] else ''}."},
            {"role": "user", "content": "Добре, а які найбільші витрати?"},
            {"role": "assistant", "content": f"Найбільші витрати за {m}:\n{cats_str}\nЗагалом {mdata['count']} транзакцій."},
        ], "multi_turn_topic_change")

if garmin and sorted_months and workouts_by_date:
    for idx in range(min(2, len(_sorted_gw), len(sorted_months))):
        wk = _sorted_gw[idx]
        m = sorted_months[-(1 + idx)]
        avg = garmin_week_avg(_garmin_weeks[wk])
        if avg["steps"] is None:
            continue

        mdata = tx_by_month[m]
        exp = round(mdata["expenses"])

        wk_dt = datetime.strptime(wk, "%Y-%m-%d")
        wk_dates = [(wk_dt + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(7)]
        wk_workouts = {d: workouts_by_date[d] for d in wk_dates if d in workouts_by_date}
        wk_mg = set()
        for d, rows in wk_workouts.items():
            for row in rows:
                if row.get("muscle_group"):
                    wk_mg.add(row["muscle_group"])

        add_example([
            {"role": "system", "content": SYSTEM_QA},
            {"role": "user", "content": "Як мій пульс цей тиждень?"},
            {"role": "assistant", "content": f"Пульс спокою за тиждень {wk}: {avg['hr']} bpm.{' Стрес: ' + str(avg['stress']) + '/100.' if avg['stress'] else ''}"},
            {"role": "user", "content": "А скільки грошей витратив?"},
            {"role": "assistant", "content": f"За {m}: {exp} EUR ({mdata['count']} транзакцій)."},
            {"role": "user", "content": "І як тренування?"},
            {"role": "assistant", "content": f"За тиждень {wk}: {len(wk_workouts)} тренувань.{' Групи: ' + ', '.join(sorted(wk_mg)) + '.' if wk_mg else ' Тренувань не зафіксовано.'}"},
        ], "multi_turn_topic_change")

print(f"  → {stats['multi_turn_finance']} finance + {stats['multi_turn_health']} health + {stats['multi_turn_cross_domain']} cross-domain + {stats['multi_turn_refusal']} refusal + {stats['multi_turn_topic_change']} topic-change multi-turn")


# ============================================================
# 14. Category spending & augmentation
# ============================================================
print("\n=== Phase 14: Augmented examples ===")

cat_totals = defaultdict(float)
cat_counts = defaultdict(int)
for row in transactions:
    if row.get("type") == "EXPENSE" and row.get("sub_type") != "TRANSFER" and row.get("amount_eur"):
        cat = (row.get("category") or "Other").split(" / ")[0]
        cat_totals[cat] += abs(safe_float(row["amount_eur"]))
        cat_counts[cat] += 1

top_categories = sorted(cat_totals.items(), key=lambda x: -x[1])[:10]
for cat, total in top_categories:
    months_count = len(sorted_months) or 1
    avg_monthly = round(total / months_count)
    add_example([
        {"role": "system", "content": SYSTEM_QA},
        {"role": "user", "content": f"Скільки я витрачаю на {cat}?"},
        {"role": "assistant", "content": f"Загалом на {cat}: {round(total)} EUR за {months_count} місяців ({cat_counts[cat]} транзакцій).\nСередньо: {avg_monthly} EUR/міс."},
    ], "category_spending")

# Period variation
recent_3m = sorted_months[-3:] if len(sorted_months) >= 3 else sorted_months
if recent_3m:
    total_inc = sum(tx_by_month[m]["income"] for m in recent_3m)
    total_exp = sum(tx_by_month[m]["expenses"] for m in recent_3m)
    bal = total_inc - total_exp

    add_example([
        {"role": "system", "content": SYSTEM_QA},
        {"role": "user", "content": "Як мої фінанси за останні 3 місяці?"},
        {"role": "assistant", "content": f"За останні 3 місяці ({', '.join(recent_3m)}):\n• Дохід: {round(total_inc)} EUR\n• Витрати: {round(total_exp)} EUR\n• Баланс: {'+' if bal >= 0 else ''}{round(bal)} EUR\n• Середні витрати/міс: {round(total_exp / len(recent_3m))} EUR"},
    ], "period_variation")

    add_example([
        {"role": "system", "content": SYSTEM_QA},
        {"role": "user", "content": "Покажи мої витрати за квартал"},
        {"role": "assistant", "content": f"Витрати за квартал ({', '.join(recent_3m)}):\n• Загалом: {round(total_exp)} EUR\n• Середньо: {round(total_exp / len(recent_3m))} EUR/міс\n• Баланс з доходами: {'+' if bal >= 0 else ''}{round(bal)} EUR"},
    ], "period_variation")

# Sleep quality analysis
good_sleep = [r for r in garmin_sleep if r.get("sleep_score") and safe_int(r["sleep_score"]) >= 80]
bad_sleep = [r for r in garmin_sleep if r.get("sleep_score") and safe_int(r["sleep_score"]) < 60]
if good_sleep:
    avg_good_dur = round(sum(safe_int(r["duration_seconds"]) for r in good_sleep if r.get("duration_seconds")) / len(good_sleep) / 3600, 1)
    add_example([
        {"role": "system", "content": SYSTEM_QA},
        {"role": "user", "content": "Коли я сплю найкраще?"},
        {"role": "assistant", "content": f"Ти маєш {len(good_sleep)} ночей з Sleep Score 80+ (з {len(garmin_sleep)} загальних). Середня тривалість хорошого сну: {avg_good_dur} год. Якісний сон корелює з вищим Body Battery та кращим настроєм наступного дня."},
    ], "sleep_analysis")

if bad_sleep:
    add_example([
        {"role": "system", "content": SYSTEM_QA},
        {"role": "user", "content": "Чому в мене поганий сон?"},
        {"role": "assistant", "content": f"У тебе {len(bad_sleep)} ночей з Sleep Score нижче 60. Основні причини поганого сну: пізній кофеїн, стрес, екранний час перед сном. Рекомендація: кофеїн до 14:00, режим сну 23:00-7:00."},
    ], "sleep_analysis")

print(f"  → {stats['category_spending']} category + {stats['period_variation']} period + {stats['sleep_analysis']} sleep analysis")


# ============================================================
# 15. Health trend comparisons (week vs week)
# ============================================================
print("\n=== Phase 15: Health trends ===")

garmin_by_week = defaultdict(list)
for r in garmin:
    if r.get("date"):
        dt = datetime.strptime(r["date"], "%Y-%m-%d")
        ws = (dt - timedelta(days=dt.weekday())).strftime("%Y-%m-%d")
        garmin_by_week[ws].append(r)

sorted_weeks = sorted(garmin_by_week.keys(), reverse=True)
for i in range(1, min(len(sorted_weeks), 10)):
    w1, w2 = sorted_weeks[i], sorted_weeks[i - 1]
    d1, d2 = garmin_by_week[w1], garmin_by_week[w2]

    steps1 = [safe_int(r["steps"]) for r in d1 if r.get("steps")]
    steps2 = [safe_int(r["steps"]) for r in d2 if r.get("steps")]
    hr1 = [safe_int(r["resting_hr"]) for r in d1 if r.get("resting_hr")]
    hr2 = [safe_int(r["resting_hr"]) for r in d2 if r.get("resting_hr")]

    if not steps1 or not steps2:
        continue

    avg_s1, avg_s2 = round(sum(steps1) / len(steps1)), round(sum(steps2) / len(steps2))
    parts = [f"• Кроки: {avg_s1:,} → {avg_s2:,} ({'+' if avg_s2 - avg_s1 >= 0 else ''}{avg_s2 - avg_s1})"]

    if hr1 and hr2:
        avg_hr1, avg_hr2 = round(sum(hr1) / len(hr1)), round(sum(hr2) / len(hr2))
        parts.append(f"• Пульс: {avg_hr1} → {avg_hr2} bpm")

    add_example([
        {"role": "system", "content": SYSTEM_QA},
        {"role": "user", "content": f"Порівняй моє здоров'я за тижні {w1} і {w2}"},
        {"role": "assistant", "content": f"Тренд здоров'я {w1} → {w2}:\n" + "\n".join(parts)},
    ], "health_trend")

print(f"  → {stats['health_trend']} health trend examples")


# ============================================================
# 16. Synthetic insight examples
# ============================================================
print("\n=== Phase 16: Synthetic insight examples ===")

for month in sorted_months[-6:]:
    data = tx_by_month[month]
    inc = round(data["income"])
    exp = round(data["expenses"])
    bal = inc - exp
    top_cats = sorted(data["categories"].items(), key=lambda x: -x[1])[:3]

    severity = "positive" if bal > 0 else "warning"
    insights = [
        {"domain": "витрати", "severity": "info", "title": f"Витрати {month}: {exp} EUR",
         "body": f"{data['count']} транзакцій. Топ: {', '.join(f'{c} ({round(a)} EUR)' for c, a in top_cats)}.",
         "comparison": f"{'нижче' if exp < 5000 else 'вище'} середнього"},
        {"domain": "баланс", "severity": severity, "title": f"{'Профіцит' if bal > 0 else 'Дефіцит'}: {'+' if bal >= 0 else ''}{bal} EUR",
         "body": f"Дохід {inc} EUR vs витрати {exp} EUR.",
         "comparison": f"баланс {'позитивний' if bal > 0 else 'негативний'}"},
    ]

    add_example([
        {"role": "system", "content": SYSTEM_INSIGHTS},
        {"role": "user", "content": f"Проаналізуй фінанси за {month}. Дохід: {inc} EUR, витрати: {exp} EUR, транзакцій: {data['count']}."},
        {"role": "assistant", "content": json.dumps(insights, ensure_ascii=False)},
    ], "synthetic_insights")

print(f"  → {stats['synthetic_insights']} synthetic insight examples")


# ============================================================
# 17. RAG-aware examples (model learns to parse & cite context)
# ============================================================
print("\n=== Phase 17: RAG-aware context examples ===")

SYSTEM_RAG = """Ти — персональний AI-асистент Тараса. Ти маєш повний доступ до його фінансових, здоров'я та лайфстайл даних.
Відповідай українською мовою. Будь конкретним — використовуй числа, дати, тренди.
Коли тобі надається блок "User Data Context" — ОБОВ'ЯЗКОВО використовуй конкретні числа та дані з нього у відповіді. Не вигадуй дані — посилайся тільки на те, що є в контексті."""


def rag_wrap(date_str, domains, context_body):
    """Wrap context body in the standard RAG context format matching rag-context.ts."""
    domains_str = ", ".join(domains)
    return f"--- User Data Context ({date_str}, domains: {domains_str}) ---\n{context_body}\n--- End Context ---"


# --- 17a. Finance context → finance analysis (10 examples) ---
finance_rag_count = 0
for month in sorted_months[-12:]:
    if finance_rag_count >= 10:
        break
    data = tx_by_month[month]
    if data["count"] == 0:
        continue

    inc = round(data["income"])
    exp = round(data["expenses"])
    net = inc - exp
    top_cats = sorted(data["categories"].items(), key=lambda x: -x[1])[:5]
    cats_str = ", ".join(f"{c}: {round(a)} EUR" for c, a in top_cats)

    # Build context in the same format as rag-context.ts finance builder
    ctx_lines = [
        f"Finance ({month}-01 — {month}-28): {data['count']} tx",
        f"Income: {inc} EUR, Expenses: {exp} EUR, Net: {net} EUR",
    ]
    if top_cats:
        ctx_lines.append(f"Top categories: {cats_str}")

    context_date = f"{month}-15"
    context_block = rag_wrap(context_date, ["finance"], "\n".join(ctx_lines))

    # Vary the user questions
    questions = [
        f"Як мої фінанси за {month}?",
        f"Що з витратами за {month}?",
        f"Покажи фінансовий звіт за {month}",
        f"Скільки я витратив у {month}?",
        f"Яка ситуація з грошима за {month}?",
    ]
    q = questions[finance_rag_count % len(questions)]

    # Build response that explicitly references context numbers
    exp_pct = round(exp / max(inc, 1) * 100) if inc > 0 else 0
    biggest_cat = top_cats[0] if top_cats else ("—", 0)
    biggest_cat_pct = round(biggest_cat[1] / max(exp, 1) * 100) if exp > 0 else 0

    resp_parts = [f"За {month} на основі {data['count']} транзакцій:"]
    resp_parts.append(f"• Дохід: {inc} EUR")
    resp_parts.append(f"• Витрати: {exp} EUR ({exp_pct}% від доходу)")
    if net >= 0:
        resp_parts.append(f"• Чистий залишок: +{net} EUR — {'відмінний результат' if net > inc * 0.3 else 'нормальний результат'}")
    else:
        resp_parts.append(f"• Дефіцит: {net} EUR — витрати перевищили дохід")
    if top_cats:
        resp_parts.append(f"• Найбільше на {biggest_cat[0]} ({round(biggest_cat[1])} EUR, {biggest_cat_pct}% витрат)")
        if len(top_cats) > 1:
            resp_parts.append(f"• Далі: {', '.join(f'{c} ({round(a)} EUR)' for c, a in top_cats[1:3])}")

    add_example([
        {"role": "system", "content": SYSTEM_RAG},
        {"role": "user", "content": f"{context_block}\n\n{q}"},
        {"role": "assistant", "content": "\n".join(resp_parts)},
    ], "rag_finance")
    finance_rag_count += 1

# --- 17b. Health context → health analysis (5 examples) ---
health_rag_count = 0
for i in range(0, min(len(garmin), 90), 14):
    if health_rag_count >= 5:
        break
    week = garmin[i:i + 7]
    if len(week) < 3:
        continue

    date_from = week[-1].get("date", "?")
    date_to = week[0].get("date", "?")
    steps_list = [safe_int(r["steps"]) for r in week if r.get("steps")]
    hr_list = [safe_int(r["resting_hr"]) for r in week if r.get("resting_hr")]
    stress_list = [safe_int(r["avg_stress"]) for r in week if r.get("avg_stress")]
    bb_high_list = [safe_int(r["body_battery_high"]) for r in week if r.get("body_battery_high")]
    bb_low_list = [safe_int(r["body_battery_low"]) for r in week if r.get("body_battery_low")]
    sleep_scores_list = [safe_int(r["sleep_score"]) for r in week if r.get("sleep_score")]
    hrv_list = [safe_int(r.get("hrv_last_night")) for r in week if r.get("hrv_last_night")]
    cal_list = [safe_int(r.get("calories_total")) for r in week if r.get("calories_total")]
    vo2_list = [safe_float(r.get("vo2max_running")) for r in week if r.get("vo2max_running")]

    if not steps_list:
        continue

    # Build context lines matching rag-context.ts health builder format
    ctx_lines = [f"Garmin Health ({date_from} — {date_to}):"]
    for r in week:
        d = r.get("date", "?")
        items = [f"  {d}:"]
        if r.get("steps"):
            items.append(f"steps={r['steps']}")
        if r.get("resting_hr"):
            items.append(f"restHR={r['resting_hr']}")
        if r.get("avg_stress"):
            items.append(f"stress={r['avg_stress']}")
        if r.get("body_battery_high"):
            items.append(f"BB={r.get('body_battery_low', '?')}-{r['body_battery_high']}")
        if r.get("sleep_score"):
            items.append(f"sleepScore={r['sleep_score']}")
        if r.get("hrv_last_night"):
            items.append(f"hrv={r['hrv_last_night']}ms")
        if r.get("calories_total"):
            items.append(f"cal={r['calories_total']}")
        if r.get("vo2max_running"):
            items.append(f"VO2max={r['vo2max_running']}")
        if len(items) > 1:
            ctx_lines.append(" ".join(items))

    context_block = rag_wrap(date_to, ["health"], "\n".join(ctx_lines))

    avg_steps = round(sum(steps_list) / len(steps_list))
    avg_hr = round(sum(hr_list) / len(hr_list)) if hr_list else None
    avg_stress = round(sum(stress_list) / len(stress_list)) if stress_list else None
    avg_bb = round(sum(bb_high_list) / len(bb_high_list)) if bb_high_list else None
    avg_hrv = round(sum(hrv_list) / len(hrv_list)) if hrv_list else None

    questions = [
        f"Як моє здоров'я за останній тиждень?",
        f"Що показує Garmin за {date_from} — {date_to}?",
        f"Як мій стан здоров'я?",
        f"Покажи дані з Garmin",
        f"Що зі здоров'ям за тиждень?",
    ]
    q = questions[health_rag_count % len(questions)]

    resp_parts = [f"За {date_from} — {date_to} ({len(week)} днів):"]
    resp_parts.append(f"• Середні кроки: {avg_steps:,}/день")
    if avg_hr:
        hr_status = "в нормі" if 55 <= avg_hr <= 70 else "підвищений" if avg_hr > 70 else "низький"
        resp_parts.append(f"• Пульс спокою: {avg_hr} bpm ({hr_status})")
    if avg_stress:
        stress_status = "низький" if avg_stress < 30 else "помірний" if avg_stress < 50 else "підвищений"
        resp_parts.append(f"• Стрес: {avg_stress}/100 ({stress_status})")
    if avg_bb:
        resp_parts.append(f"• Body Battery (max): {avg_bb}%")
    if avg_hrv:
        resp_parts.append(f"• HRV: {avg_hrv} мс")
    if avg_steps >= 10000:
        resp_parts.append("Активність відмінна — стабільно понад 10k кроків.")
    elif avg_steps >= 7000:
        resp_parts.append("Активність хороша, але можна додати більше руху.")
    else:
        resp_parts.append("Активність нижче рекомендованої — спробуй більше ходити.")

    add_example([
        {"role": "system", "content": SYSTEM_RAG},
        {"role": "user", "content": f"{context_block}\n\n{q}"},
        {"role": "assistant", "content": "\n".join(resp_parts)},
    ], "rag_health")
    health_rag_count += 1

# --- 17c. Sleep context → sleep analysis (3 examples) ---
sleep_rag_count = 0
for i in range(0, min(len(garmin_sleep), 60), 14):
    if sleep_rag_count >= 3:
        break
    week = garmin_sleep[i:i + 7]
    if len(week) < 3:
        continue

    date_from = week[-1].get("date", "?")
    date_to = week[0].get("date", "?")

    scores = [safe_int(r["sleep_score"]) for r in week if r.get("sleep_score")]
    durations = [safe_int(r["duration_seconds"]) for r in week if r.get("duration_seconds")]
    deep_list = [safe_int(r["deep_seconds"]) for r in week if r.get("deep_seconds")]
    rem_list = [safe_int(r["rem_seconds"]) for r in week if r.get("rem_seconds")]
    avg_hr_list = [safe_int(r.get("avg_hr")) for r in week if r.get("avg_hr")]
    hrv_s_list = [safe_int(r.get("hrv_sleep")) for r in week if r.get("hrv_sleep")]
    bb_ch_list = [safe_int(r.get("body_battery_change")) for r in week if r.get("body_battery_change")]

    if not scores or not durations:
        continue

    # Build context matching rag-context.ts sleep builder format
    ctx_lines = [f"Sleep ({date_from} — {date_to}):"]
    for r in week:
        d = r.get("date", "?")
        dur_h = round(safe_int(r.get("duration_seconds")) / 3600, 1) if r.get("duration_seconds") else "?"
        items = [f"  {d}: {dur_h}h"]
        if r.get("deep_seconds"):
            items.append(f"deep={round(safe_int(r['deep_seconds']) / 60)}m")
        if r.get("rem_seconds"):
            items.append(f"rem={round(safe_int(r['rem_seconds']) / 60)}m")
        if r.get("sleep_score"):
            items.append(f"score={r['sleep_score']}")
        if r.get("avg_hr"):
            items.append(f"avgHR={r['avg_hr']}")
        if r.get("hrv_sleep"):
            items.append(f"hrv={r['hrv_sleep']}ms")
        if r.get("body_battery_change"):
            items.append(f"BB+{r['body_battery_change']}")
        ctx_lines.append(" ".join(items))

    context_block = rag_wrap(date_to, ["sleep"], "\n".join(ctx_lines))

    avg_score = round(sum(scores) / len(scores))
    avg_dur = round(sum(durations) / len(durations) / 3600, 1)
    avg_deep = round(sum(deep_list) / len(deep_list) / 60) if deep_list else None
    avg_rem = round(sum(rem_list) / len(rem_list) / 60) if rem_list else None

    quality = "відмінна" if avg_score >= 80 else "добра" if avg_score >= 65 else "потребує покращення"

    questions = [
        f"Як мій сон за останній тиждень?",
        f"Що з якістю сну?",
        f"Проаналізуй мій сон за {date_from} — {date_to}",
    ]
    q = questions[sleep_rag_count % len(questions)]

    resp_parts = [f"Сон за {date_from} — {date_to}:"]
    resp_parts.append(f"• Sleep Score: {avg_score}/100 — якість {quality}")
    resp_parts.append(f"• Тривалість: в середньому {avg_dur} год")
    if avg_deep:
        deep_status = "достатньо" if avg_deep >= 60 else "мало — потрібно більше"
        resp_parts.append(f"• Глибокий сон: {avg_deep} хв ({deep_status})")
    if avg_rem:
        resp_parts.append(f"• REM: {avg_rem} хв")
    if avg_hr_list:
        avg_sleep_hr = round(sum(avg_hr_list) / len(avg_hr_list))
        resp_parts.append(f"• Пульс уві сні: {avg_sleep_hr} bpm")
    if bb_ch_list:
        avg_bb_ch = round(sum(bb_ch_list) / len(bb_ch_list))
        resp_parts.append(f"• Відновлення Body Battery: +{avg_bb_ch}")
    if avg_score < 65:
        resp_parts.append("Рекомендація: лягай раніше, зменш кофеїн після 14:00, уникай екранів за годину до сну.")

    add_example([
        {"role": "system", "content": SYSTEM_RAG},
        {"role": "user", "content": f"{context_block}\n\n{q}"},
        {"role": "assistant", "content": "\n".join(resp_parts)},
    ], "rag_sleep")
    sleep_rag_count += 1

# --- 17d. Gym context → workout analysis (3 examples) ---
gym_rag_count = 0
sorted_workout_weeks = sorted(week_workouts.items(), reverse=True) if sorted_dates else []
for week_start, dates in sorted_workout_weeks:
    if gym_rag_count >= 3:
        break

    week_end_dt = datetime.strptime(week_start, "%Y-%m-%d") + timedelta(days=6)
    week_end = week_end_dt.strftime("%Y-%m-%d")
    num_sessions = len(dates)
    if num_sessions == 0:
        continue

    # Build context matching rag-context.ts gym builder format
    ctx_lines = [f"Workouts ({week_start} — {week_end}):"]
    total_volume = 0
    all_exercises = set()
    all_muscle_groups = set()
    for d in sorted(dates):
        exercises_in_day = defaultdict(lambda: {"sets": 0, "max_w": 0})
        day_volume = 0
        day_exercises = []
        for row in workouts_by_date[d]:
            ex = row.get("exercise", "")
            mg = row.get("muscle_group", "")
            w = safe_float(row.get("weight_kg"))
            reps = safe_int(row.get("reps", 0))
            if ex:
                all_exercises.add(ex)
                day_exercises.append(ex)
                exercises_in_day[ex]["sets"] += 1
                if w > exercises_in_day[ex]["max_w"]:
                    exercises_in_day[ex]["max_w"] = w
            if mg:
                all_muscle_groups.add(mg)
            vol = w * reps
            day_volume += vol
            total_volume += vol

        ex_names = list(dict.fromkeys(day_exercises))  # unique, preserve order
        items = [f"  {d}:"]
        workout_name = workouts_by_date[d][0].get("workout_name", "") if workouts_by_date[d] else ""
        if workout_name:
            items.append(f'"{workout_name}"')
        items.append(f"{len(exercises_in_day)} exercises")
        if day_volume > 0:
            items.append(f"volume={round(day_volume)}kg")
        if ex_names:
            items.append(f"[{', '.join(ex_names[:5])}]")
        ctx_lines.append(" ".join(items))

    context_block = rag_wrap(week_end, ["gym"], "\n".join(ctx_lines))

    questions = [
        f"Як мої тренування за тиждень?",
        f"Скільки я тренувався за {week_start} — {week_end}?",
        f"Покажи тренувальний звіт",
    ]
    q = questions[gym_rag_count % len(questions)]

    resp_parts = [f"Тренування за {week_start} — {week_end}:"]
    resp_parts.append(f"• Сесій: {num_sessions}")
    if all_muscle_groups:
        resp_parts.append(f"• Групи м'язів: {', '.join(sorted(all_muscle_groups))}")
    if total_volume > 0:
        resp_parts.append(f"• Загальний об'єм: {round(total_volume):,} кг")
        resp_parts.append(f"• Середній об'єм/сесію: {round(total_volume / num_sessions):,} кг")
    freq_comment = "відмінна частота" if num_sessions >= 4 else "хороша частота" if num_sessions >= 3 else "можна додати ще тренування"
    resp_parts.append(f"• {num_sessions} тренувань на тиждень — {freq_comment}")

    add_example([
        {"role": "system", "content": SYSTEM_RAG},
        {"role": "user", "content": f"{context_block}\n\n{q}"},
        {"role": "assistant", "content": "\n".join(resp_parts)},
    ], "rag_gym")
    gym_rag_count += 1

# --- 17e. Mixed context → cross-domain analysis (5 examples) ---
mixed_rag_count = 0
# Find dates that have both garmin and financial data
mixed_months = [m for m in sorted_months if m in [g.get("date", "")[:7] for g in garmin[:60]]]
if not mixed_months:
    mixed_months = sorted_months[-5:]

for month in mixed_months[-7:]:
    if mixed_rag_count >= 5:
        break

    fin_data = tx_by_month.get(month)
    if not fin_data or fin_data["count"] == 0:
        continue

    # Gather health data for this month
    month_garmin = [r for r in garmin if r.get("date", "").startswith(month)]
    month_sleep = [r for r in garmin_sleep if r.get("date", "").startswith(month)]
    month_workouts_dates = [d for d in sorted_dates if d.startswith(month)] if sorted_dates else []

    if not month_garmin:
        continue

    # Build multi-domain context
    ctx_parts = []

    # Finance section
    inc = round(fin_data["income"])
    exp = round(fin_data["expenses"])
    net = inc - exp
    top_cats = sorted(fin_data["categories"].items(), key=lambda x: -x[1])[:3]
    cats_str = ", ".join(f"{c}: {round(a)} EUR" for c, a in top_cats)
    ctx_parts.append(f"Finance ({month}-01 — {month}-28): {fin_data['count']} tx")
    ctx_parts.append(f"Income: {inc} EUR, Expenses: {exp} EUR, Net: {net} EUR")
    if top_cats:
        ctx_parts.append(f"Top categories: {cats_str}")

    # Health section
    m_steps = [safe_int(r["steps"]) for r in month_garmin if r.get("steps")]
    m_hr = [safe_int(r["resting_hr"]) for r in month_garmin if r.get("resting_hr")]
    m_stress = [safe_int(r["avg_stress"]) for r in month_garmin if r.get("avg_stress")]
    if m_steps:
        avg_steps = round(sum(m_steps) / len(m_steps))
        ctx_parts.append(f"\nGarmin Health ({month}): {len(month_garmin)} days")
        ctx_parts.append(f"Avg steps: {avg_steps}, Avg restHR: {round(sum(m_hr) / len(m_hr)) if m_hr else '?'}")
        if m_stress:
            ctx_parts.append(f"Avg stress: {round(sum(m_stress) / len(m_stress))}")

    # Sleep section
    if month_sleep:
        m_scores = [safe_int(r["sleep_score"]) for r in month_sleep if r.get("sleep_score")]
        m_dur = [safe_int(r["duration_seconds"]) for r in month_sleep if r.get("duration_seconds")]
        if m_scores and m_dur:
            ctx_parts.append(f"\nSleep ({month}): avg score={round(sum(m_scores) / len(m_scores))}, avg duration={round(sum(m_dur) / len(m_dur) / 3600, 1)}h")

    # Gym section
    if month_workouts_dates:
        ctx_parts.append(f"\nWorkouts ({month}): {len(month_workouts_dates)} sessions")

    domains = ["finance", "health"]
    if month_sleep:
        domains.append("sleep")
    if month_workouts_dates:
        domains.append("gym")

    context_block = rag_wrap(f"{month}-28", domains, "\n".join(ctx_parts))

    questions = [
        f"Дай загальний огляд за {month}",
        f"Як пройшов місяць {month}?",
        f"Покажи зведений звіт за {month}",
        f"Що відбувалось у {month}?",
        f"Підсумок місяця {month}",
    ]
    q = questions[mixed_rag_count % len(questions)]

    resp_parts = [f"Огляд за {month}:"]
    resp_parts.append(f"\nФінанси:")
    resp_parts.append(f"• Дохід: {inc} EUR, витрати: {exp} EUR")
    resp_parts.append(f"• Баланс: {'+' if net >= 0 else ''}{net} EUR")
    if top_cats:
        resp_parts.append(f"• Основні витрати: {cats_str}")

    if m_steps:
        resp_parts.append(f"\nЗдоров'я:")
        resp_parts.append(f"• Кроки: {avg_steps:,}/день в середньому")
        if m_hr:
            resp_parts.append(f"• Пульс спокою: {round(sum(m_hr) / len(m_hr))} bpm")
        if m_stress:
            avg_st = round(sum(m_stress) / len(m_stress))
            resp_parts.append(f"• Стрес: {avg_st}/100")

    if month_sleep and m_scores and m_dur:
        avg_sc = round(sum(m_scores) / len(m_scores))
        avg_d = round(sum(m_dur) / len(m_dur) / 3600, 1)
        resp_parts.append(f"\nСон:")
        resp_parts.append(f"• Sleep Score: {avg_sc}/100, тривалість: {avg_d} год")

    if month_workouts_dates:
        resp_parts.append(f"\nТренування: {len(month_workouts_dates)} сесій за місяць")

    add_example([
        {"role": "system", "content": SYSTEM_RAG},
        {"role": "user", "content": f"{context_block}\n\n{q}"},
        {"role": "assistant", "content": "\n".join(resp_parts)},
    ], "rag_mixed")
    mixed_rag_count += 1

# --- 17f. Context with missing data → honest "немає даних" (4 examples) ---

# Empty finance context
empty_fin_ctx = rag_wrap("2026-03-15", ["finance"],
    "Finance (2026-03-01 — 2026-03-15): 0 tx")
add_example([
    {"role": "system", "content": SYSTEM_RAG},
    {"role": "user", "content": f"{empty_fin_ctx}\n\nЯк мої фінанси за перші два тижні березня?"},
    {"role": "assistant", "content": "За період 2026-03-01 — 2026-03-15 у контексті 0 транзакцій. Можливо, дані ще не синхронізовані з банком. Перевір підключення Monobank/bunq у дашборді."},
], "rag_missing")

# Context with health but question about gym (missing domain)
health_only_ctx_lines = [
    "Garmin Health (2026-03-08 — 2026-03-15):",
    "  2026-03-15: steps=8500 restHR=62 stress=35 BB=25-85 sleepScore=78",
    "  2026-03-14: steps=11200 restHR=60 stress=28 BB=30-90 sleepScore=82",
]
health_only_ctx = rag_wrap("2026-03-15", ["health"], "\n".join(health_only_ctx_lines))
add_example([
    {"role": "system", "content": SYSTEM_RAG},
    {"role": "user", "content": f"{health_only_ctx}\n\nЯк мої тренування в залі?"},
    {"role": "assistant", "content": "У наданому контексті є тільки дані Garmin Health, але немає інформації про тренування в залі. З Garmin бачу, що здоров'я в нормі: кроки 8 500–11 200, пульс 60–62, стрес низький (28–35). Для даних про зал потрібен gym-контекст."},
], "rag_missing")

# Partial data — sleep context with some missing fields
partial_sleep_ctx_lines = [
    "Sleep (2026-03-10 — 2026-03-15):",
    "  2026-03-15: 7.2h score=75",
    "  2026-03-14: 6.1h score=58",
    "  2026-03-13: ?h",
    "  2026-03-12: 7.8h deep=85m score=82",
]
partial_sleep_ctx = rag_wrap("2026-03-15", ["sleep"], "\n".join(partial_sleep_ctx_lines))
add_example([
    {"role": "system", "content": SYSTEM_RAG},
    {"role": "user", "content": f"{partial_sleep_ctx}\n\nПроаналізуй мій сон"},
    {"role": "assistant", "content": "Сон за 10–15 березня (дані є за 3 з 4 ночей):\n• Найкращий: 12 березня — score 82, 7.8 год, 85 хв глибокого сну\n• 15 березня: score 75, 7.2 год — непогано\n• 14 березня: score 58, 6.1 год — мало, якість нижче норми\n• 13 березня: дані відсутні\nСередній score (з наявних): 72/100. Варто звернути увагу на ніч 14-го — коротка тривалість вплинула на якість."},
], "rag_missing")

# Empty multi-domain context
empty_multi_ctx = rag_wrap("2026-01-05", ["finance", "health", "sleep"],
    "Finance (2025-12-22 — 2026-01-05): 0 tx")
add_example([
    {"role": "system", "content": SYSTEM_RAG},
    {"role": "user", "content": f"{empty_multi_ctx}\n\nДай повний огляд за останні два тижні"},
    {"role": "assistant", "content": "У контексті майже немає даних за цей період:\n• Фінанси: 0 транзакцій — дані не синхронізовані\n• Здоров'я: немає даних Garmin\n• Сон: немає даних\n\nМожливі причини: синхронізація з банком або Garmin не працювала, або це період відпустки. Перевір підключення в налаштуваннях дашборду."},
], "rag_missing")

print(f"  → {stats['rag_finance']} finance + {stats['rag_health']} health + {stats['rag_sleep']} sleep + {stats['rag_gym']} gym + {stats['rag_mixed']} mixed + {stats['rag_missing']} missing = {stats['rag_finance'] + stats['rag_health'] + stats['rag_sleep'] + stats['rag_gym'] + stats['rag_mixed'] + stats['rag_missing']} RAG-aware examples")


# ============================================================
# Shuffle and split 90/10
# ============================================================
print("\n=== Splitting and saving ===")

random.seed(42)
random.shuffle(examples)
split = int(len(examples) * 0.9)
train = examples[:split]
valid = examples[split:]

with open(OUTPUT, "w") as f:
    for ex in train:
        f.write(json.dumps(ex, ensure_ascii=False) + "\n")

with open(VAL_OUTPUT, "w") as f:
    for ex in valid:
        f.write(json.dumps(ex, ensure_ascii=False) + "\n")

# ============================================================
# Stats
# ============================================================
print(f"\n{'=' * 50}")
print(f"TOTAL: {len(examples)} examples")
print(f"  Train: {len(train)}")
print(f"  Valid: {len(valid)}")
print(f"\nPer-category breakdown:")
for cat, count in sorted(stats.items(), key=lambda x: -x[1]):
    print(f"  {cat}: {count}")
print(f"\nData sizes:")
print(f"  transactions: {len(transactions)} rows")
print(f"  daily_logs: {len(daily_logs)} rows")
print(f"  garmin: {len(garmin)} rows")
print(f"  garmin_sleep: {len(garmin_sleep)} rows")
print(f"  workouts: {len(workouts)} rows")
print(f"  body_composition: {len(body_composition)} rows")
print(f"  garmin_activities: {len(garmin_activities)} rows")
print(f"  investments: {len(investments)} rows")
print(f"  portfolio: {len(portfolio)} rows")
print(f"  reference_insights: {len(reference_insights)} rows")
print(f"\nFiles saved:")
print(f"  {OUTPUT}")
print(f"  {VAL_OUTPUT}")
