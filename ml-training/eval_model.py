"""Evaluate pd-assistant model quality against reference insights.

Metrics 1-7: original (max 7 points)
Metrics 8-15: new quality metrics (max 8 points)
Total: max 15 points per question.

Usage:
    python3 eval_model.py                  # run with built-in test questions
    python3 eval_model.py response.json    # evaluate a JSON response file
"""
import json
import os
import re
import subprocess
import sys
from datetime import datetime

OLLAMA_MODEL = "pd-assistant"
EVAL_RESULTS_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "eval_results.json")

# ---------------------------------------------------------------------------
# Test questions with sample RAG context
# ---------------------------------------------------------------------------
TEST_QUESTIONS = [
    {
        "id": 1,
        "question": "Як мої витрати цього місяця?",
        "page": "finance",
        "context": (
            "Транзакції за березень 2026:\n"
            "2026-03-01 Супермаркет -82.30 EUR\n"
            "2026-03-03 Оренда -1200.00 EUR\n"
            "2026-03-05 Ресторан -45.00 EUR\n"
            "2026-03-07 Комунальні -130.50 EUR\n"
            "2026-03-10 Підписки -29.99 EUR\n"
            "2026-03-12 Транспорт -60.00 EUR\n"
            "2026-03-15 Супермаркет -95.20 EUR\n"
            "2026-03-18 Одяг -210.00 EUR\n"
            "Загалом: -1852.99 EUR\n"
            "Минулий місяць (лютий): -1640.00 EUR (+13% зростання)"
        ),
    },
    {
        "id": 2,
        "question": "Чому я погано спав?",
        "page": "health",
        "context": (
            "Garmin Sleep за останні 7 днів:\n"
            "2026-03-15: 5h12m, score 42, stress_avg 58\n"
            "2026-03-16: 6h01m, score 55, stress_avg 51\n"
            "2026-03-17: 4h45m, score 38, stress_avg 65\n"
            "2026-03-18: 5h30m, score 48, stress_avg 60\n"
            "2026-03-19: 7h10m, score 72, stress_avg 35\n"
            "2026-03-20: 5h05m, score 40, stress_avg 62\n"
            "2026-03-21: 4h50m, score 39, stress_avg 67\n"
            "Середній сон за місяць: 5h30m (норма 7-8h)\n"
            "Кофеїн: 3-4 чашки/день, остання о 17:00\n"
            "Тренування: 19:30-21:00 у дні поганого сну"
        ),
    },
    {
        "id": 3,
        "question": "Покажи прогрес тренувань",
        "page": "gym",
        "context": (
            "Тренування за березень 2026:\n"
            "2026-03-02 Груди+Тріцепс: bench 80kg x8, incline 60kg x10, dips BW+20kg x8\n"
            "2026-03-05 Спина+Біцепс: deadlift 120kg x5, pullups BW+15kg x6, rows 70kg x10\n"
            "2026-03-09 Ноги: squat 100kg x6, leg press 180kg x12, RDL 90kg x8\n"
            "2026-03-12 Груди+Тріцепс: bench 82.5kg x7, incline 62.5kg x9, dips BW+22.5kg x7\n"
            "2026-03-16 Спина+Біцепс: deadlift 125kg x5, pullups BW+17.5kg x6, rows 72.5kg x9\n"
            "2026-03-19 Ноги: squat 105kg x5, leg press 190kg x11, RDL 95kg x7\n"
            "Лютий: bench max 77.5kg, squat max 95kg, deadlift max 115kg"
        ),
    },
    {
        "id": 4,
        "question": "Порівняй цей тиждень з минулим",
        "page": "health",
        "context": (
            "Тиждень 15-21 березня 2026:\n"
            "Кроки: 8200, 7500, 9100, 6800, 10200, 7900, 8500 (avg 8314)\n"
            "Калорії: 2100, 1950, 2300, 2050, 2400, 2150, 2000 (avg 2136)\n"
            "Сон: 5h12, 6h01, 4h45, 5h30, 7h10, 5h05, 4h50 (avg 5h30)\n"
            "Stress avg: 52\n\n"
            "Тиждень 8-14 березня 2026:\n"
            "Кроки: 9500, 8800, 10100, 9200, 11000, 8700, 9000 (avg 9471)\n"
            "Калорії: 2200, 2100, 2350, 2180, 2450, 2200, 2100 (avg 2226)\n"
            "Сон: 7h00, 6h45, 7h20, 6h50, 7h30, 7h10, 6h55 (avg 7h04)\n"
            "Stress avg: 38"
        ),
    },
    {
        "id": 5,
        "question": "Які інвестиції найкращі?",
        "page": "investments",
        "context": (
            "Портфель IBKR станом на 2026-03-21:\n"
            "VWCE: 150 шт, avg 105.20 EUR, current 112.80 EUR, P&L +1140.00 EUR (+7.2%)\n"
            "IWDA: 80 шт, avg 82.50 EUR, current 88.10 EUR, P&L +448.00 EUR (+6.8%)\n"
            "IEMA: 60 шт, avg 33.40 EUR, current 31.20 EUR, P&L -132.00 EUR (-3.6%)\n"
            "IS3N: 40 шт, avg 42.80 EUR, current 46.90 EUR, P&L +164.00 EUR (+9.6%)\n"
            "CSPX: 25 шт, avg 510.00 EUR, current 545.00 EUR, P&L +875.00 EUR (+6.9%)\n"
            "Загальний NAV: 38,450 EUR, Total P&L: +2,495 EUR (+6.9%)\n"
            "Benchmark (MSCI World YTD): +5.1%"
        ),
    },
]

# ---------------------------------------------------------------------------
# Hallucination indicator phrases
# ---------------------------------------------------------------------------
HALLUCINATION_PHRASES = [
    "можливо", "напевно", "я думаю", "мабуть", "ймовірно",
    "не впевнений", "не впевнена", "здається", "скоріше за все",
    "точно не знаю", "важко сказати", "не можу стверджувати",
]

# ---------------------------------------------------------------------------
# Trend / comparison keywords
# ---------------------------------------------------------------------------
TREND_KEYWORDS = [
    "зросло", "зріс", "знизилось", "знизився", "зменшилось", "зменшився",
    "збільшилось", "збільшився", "покращилось", "покращився",
    "погіршилось", "погіршився", "порівняно", "тренд", "динаміка",
    "більше", "менше", "вище", "нижче", "ріст", "падіння", "зміна",
    "стабільно", "коливання", "+", "−", "−", "%",
]

# ---------------------------------------------------------------------------
# Actionability keywords
# ---------------------------------------------------------------------------
ACTION_KEYWORDS = [
    "рекомендую", "рекомендація", "варто", "спробуй", "спробувати",
    "раджу", "порада", "зверни увагу", "потрібно", "слід",
    "краще", "оптимально", "пропоную", "план", "крок",
    "можна покращити", "для покращення",
]

# ---------------------------------------------------------------------------
# Scoring functions
# ---------------------------------------------------------------------------

def score_original(insights: list, all_text: str, page: str) -> dict:
    """Original 7 metrics (1 pt each)."""
    scores = {}

    # 1. JSON validity — already passed if we got here
    scores["json_valid"] = True

    # 2. Schema compliance
    required = {"domain", "severity", "title", "body"}
    scores["schema_ok"] = all(required <= set(i.keys()) for i in insights)

    # 3. Count 3-5
    scores["count_ok"] = 3 <= len(insights) <= 5

    # 4. Ukrainian language
    scores["ukrainian"] = bool(re.search(r'[іїєґІЇЄҐ]', all_text))

    # 5. Specificity — numbers present
    scores["has_numbers"] = bool(re.search(r'\d+', all_text))

    # 6. Domain relevance
    scores["domain_match"] = all(i.get("domain") == page for i in insights)

    # 7. No English leaks
    english_words = len(re.findall(
        r'\b(the|and|for|with|this|that|from|have|been|is|are|was|were|not|but|can|will)\b',
        all_text.lower(),
    ))
    scores["no_english"] = english_words < 3

    return scores


def score_quality(insights: list, all_text: str, context: str) -> dict:
    """New quality metrics 8-15 (1 pt each)."""
    scores = {}
    text_lower = all_text.lower()

    # 8. Trend analysis
    scores["trend_analysis"] = any(kw in text_lower for kw in TREND_KEYWORDS)

    # 9. Actionability
    scores["actionability"] = any(kw in text_lower for kw in ACTION_KEYWORDS)

    # 10. Data context usage — references specific numbers/entities from context
    if context:
        # Extract numbers from context, check if at least 2 appear in response
        ctx_numbers = set(re.findall(r'\d+\.?\d*', context))
        resp_numbers = set(re.findall(r'\d+\.?\d*', all_text))
        shared = ctx_numbers & resp_numbers
        # Filter out trivially common numbers (single digits)
        meaningful_shared = {n for n in shared if len(n) >= 2 or float(n) >= 10}
        scores["context_usage"] = len(meaningful_shared) >= 2
    else:
        scores["context_usage"] = False

    # 11. Temporal awareness — mentions dates, periods, time ranges
    temporal_patterns = [
        r'\d{4}-\d{2}-\d{2}',                    # ISO dates
        r'(?:січн|лют|берез|квітн|травн|червн|липн|серпн|вересн|жовтн|листопад|груден)',
        r'(?:тижд|місяц|рік|день|ніч|вчора|сьогодні|минул|поточн|цього)',
        r'\d+\s*(?:днів|тижнів|місяців|годин|хвилин)',
    ]
    scores["temporal_awareness"] = any(
        re.search(p, text_lower) for p in temporal_patterns
    )

    # 12. Causal reasoning — explains why
    causal_patterns = [
        r'тому що', r'через те', r'причин', r'внаслідок', r'оскільки',
        r'завдяки', r'впливає', r'вплива', r'призвод', r'пов\'язан',
        r'корел', r'залеж', r'бо\b', r'адже', r'спричин',
    ]
    scores["causal_reasoning"] = any(
        re.search(p, text_lower) for p in causal_patterns
    )

    # 13. Conciseness — 50-300 words
    word_count = len(all_text.split())
    scores["conciseness"] = 50 <= word_count <= 300

    # 14. Structure — bullet points, numbered lists, or clear paragraphs
    structure_patterns = [
        r'[\-•]\s',          # bullet points
        r'\d+[\.\)]\s',      # numbered lists
        r'\n\n',             # paragraph breaks
    ]
    scores["structure"] = any(
        re.search(p, all_text) for p in structure_patterns
    )

    # 15. No hallucination indicators
    scores["no_hallucination"] = not any(
        phrase in text_lower for phrase in HALLUCINATION_PHRASES
    )

    return scores


def evaluate_response(response: str, page: str, context: str = "") -> dict:
    """Evaluate a single model response. Returns score dict with max 15."""
    result = {"page": page, "total": 0, "max": 15, "details": {}}

    # Parse JSON
    try:
        insights = json.loads(response)
        if not isinstance(insights, list):
            result["details"]["json_valid"] = False
            result["error"] = "Response is not a JSON array"
            return result
    except (json.JSONDecodeError, ValueError) as e:
        result["details"]["json_valid"] = False
        result["error"] = f"Invalid JSON: {e}"
        return result

    # Build combined text from all insights
    all_text = " ".join(
        i.get("title", "") + " " + i.get("body", "")
        for i in insights
    )

    # Original metrics (7 pts)
    orig = score_original(insights, all_text, page)
    result["details"].update(orig)

    # Quality metrics (8 pts)
    qual = score_quality(insights, all_text, context)
    result["details"].update(qual)

    # Sum up
    result["total"] = sum(1 for v in result["details"].values() if v is True)
    return result


# ---------------------------------------------------------------------------
# Ollama integration
# ---------------------------------------------------------------------------

def query_ollama(question: str, context: str, page: str) -> str:
    """Send a question to pd-assistant via ollama CLI."""
    prompt_parts = []
    if context:
        prompt_parts.append(f"Контекст даних:\n{context}\n")
    prompt_parts.append(f"Сторінка: {page}")
    prompt_parts.append(f"Питання: {question}")
    prompt_parts.append(
        'Дай 3-5 інсайтів у форматі JSON масиву: '
        '[{"domain":"...","severity":"info|warning|success","title":"...","body":"..."}]'
    )
    prompt = "\n".join(prompt_parts)

    try:
        proc = subprocess.run(
            ["ollama", "run", OLLAMA_MODEL, prompt],
            capture_output=True, text=True, timeout=120,
        )
        return proc.stdout.strip()
    except FileNotFoundError:
        return ""
    except subprocess.TimeoutExpired:
        return ""


def extract_json_from_response(raw: str) -> str:
    """Try to extract a JSON array from model output that may contain markdown."""
    # Try raw first
    raw = raw.strip()
    if raw.startswith("["):
        return raw

    # Look for ```json ... ``` block
    m = re.search(r'```(?:json)?\s*(\[.*?\])\s*```', raw, re.DOTALL)
    if m:
        return m.group(1)

    # Look for first [ ... last ]
    start = raw.find("[")
    end = raw.rfind("]")
    if start != -1 and end != -1 and end > start:
        return raw[start:end + 1]

    return raw


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------

METRIC_LABELS = {
    "json_valid": "JSON validity",
    "schema_ok": "Schema compliance",
    "count_ok": "Count (3-5)",
    "ukrainian": "Ukrainian language",
    "has_numbers": "Specificity (numbers)",
    "domain_match": "Domain relevance",
    "no_english": "No English leaks",
    "trend_analysis": "Trend analysis",
    "actionability": "Actionability",
    "context_usage": "Data context usage",
    "temporal_awareness": "Temporal awareness",
    "causal_reasoning": "Causal reasoning",
    "conciseness": "Conciseness (50-300 words)",
    "structure": "Structure",
    "no_hallucination": "No hallucination indicators",
}


def print_result(result: dict, q_info: dict) -> None:
    """Pretty-print a single question evaluation."""
    print(f"\n{'='*60}")
    print(f"Q{q_info['id']}: {q_info['question']}")
    print(f"Page: {q_info['page']}  |  Score: {result['total']}/{result['max']}")
    print(f"{'-'*60}")

    if "error" in result:
        print(f"  ERROR: {result['error']}")
        return

    for key, label in METRIC_LABELS.items():
        val = result["details"].get(key)
        if val is None:
            continue
        mark = "+" if val else "-"
        print(f"  [{mark}] {label}")


def print_summary(results: list) -> None:
    """Print overall summary with per-metric pass rates."""
    print(f"\n{'='*60}")
    print("SUMMARY")
    print(f"{'='*60}")

    totals = [r["total"] for r in results]
    avg = sum(totals) / len(totals) if totals else 0
    max_score = results[0]["max"] if results else 15

    print(f"Questions evaluated: {len(results)}")
    print(f"Average score: {avg:.1f}/{max_score} ({avg/max_score*100:.0f}%)")
    print(f"Min: {min(totals)}/{max_score}  Max: {max(totals)}/{max_score}")

    # Per-metric pass rate
    print(f"\n{'─'*60}")
    print("Per-metric pass rate:")
    for key, label in METRIC_LABELS.items():
        passes = sum(1 for r in results if r.get("details", {}).get(key, False))
        pct = passes / len(results) * 100 if results else 0
        bar = "█" * int(pct / 10) + "░" * (10 - int(pct / 10))
        print(f"  {bar} {pct:5.0f}%  {label}")


def compare_with_previous(results: list) -> None:
    """Load previous eval_results.json and compare."""
    if not os.path.exists(EVAL_RESULTS_PATH):
        print("\nNo previous results to compare (eval_results.json not found).")
        return

    try:
        with open(EVAL_RESULTS_PATH, "r") as f:
            prev = json.load(f)
    except (json.JSONDecodeError, IOError):
        print("\nCould not read previous eval_results.json.")
        return

    prev_avg = prev.get("average_score", 0)
    prev_max = prev.get("max_score", 15)
    prev_date = prev.get("timestamp", "unknown")

    curr_totals = [r["total"] for r in results]
    curr_avg = sum(curr_totals) / len(curr_totals) if curr_totals else 0

    delta = curr_avg - prev_avg
    direction = "+" if delta > 0 else ""

    print(f"\n{'─'*60}")
    print("Comparison with previous run:")
    print(f"  Previous: {prev_avg:.1f}/{prev_max} ({prev_date})")
    print(f"  Current:  {curr_avg:.1f}/{results[0]['max'] if results else 15}")
    print(f"  Delta:    {direction}{delta:.1f} points")

    # Per-metric comparison
    prev_metrics = prev.get("metric_pass_rates", {})
    if prev_metrics:
        print(f"\n  Metric changes:")
        for key, label in METRIC_LABELS.items():
            curr_passes = sum(1 for r in results if r.get("details", {}).get(key, False))
            curr_pct = curr_passes / len(results) * 100 if results else 0
            prev_pct = prev_metrics.get(key, 0)
            d = curr_pct - prev_pct
            if abs(d) >= 1:
                arrow = "+" if d > 0 else ""
                print(f"    {arrow}{d:.0f}%  {label}")


def save_results(results: list) -> None:
    """Save evaluation results to eval_results.json."""
    totals = [r["total"] for r in results]
    max_score = results[0]["max"] if results else 15
    avg = sum(totals) / len(totals) if totals else 0

    # Per-metric pass rates
    metric_pass_rates = {}
    for key in METRIC_LABELS:
        passes = sum(1 for r in results if r.get("details", {}).get(key, False))
        metric_pass_rates[key] = passes / len(results) * 100 if results else 0

    output = {
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "model": OLLAMA_MODEL,
        "questions_count": len(results),
        "average_score": round(avg, 2),
        "max_score": max_score,
        "min_score": min(totals) if totals else 0,
        "max_achieved": max(totals) if totals else 0,
        "metric_pass_rates": metric_pass_rates,
        "results": results,
    }

    with open(EVAL_RESULTS_PATH, "w") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"\nResults saved to {EVAL_RESULTS_PATH}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def run_eval_with_ollama() -> list:
    """Run all test questions through ollama and evaluate."""
    results = []
    for q in TEST_QUESTIONS:
        print(f"\nQuerying model: Q{q['id']} — {q['question']}...")
        raw = query_ollama(q["question"], q["context"], q["page"])
        if not raw:
            print(f"  No response from model (is '{OLLAMA_MODEL}' running in ollama?)")
            results.append({
                "page": q["page"],
                "total": 0,
                "max": 15,
                "details": {"json_valid": False},
                "error": "No response from model",
            })
            continue

        cleaned = extract_json_from_response(raw)
        result = evaluate_response(cleaned, q["page"], q["context"])
        result["raw_response"] = raw[:500]  # keep first 500 chars for debugging
        print_result(result, q)
        results.append(result)

    return results


def run_eval_with_sample() -> list:
    """Run evaluation on a built-in sample response for offline testing."""
    sample_response = json.dumps([
        {
            "domain": "finance",
            "severity": "warning",
            "title": "Витрати зросли на 13%",
            "body": "Загальні витрати за березень склали 1852.99 EUR, "
                    "порівняно з 1640 EUR у лютому. Найбільша категорія — оренда (1200 EUR). "
                    "Рекомендую звернути увагу на витрати на одяг (210 EUR).",
        },
        {
            "domain": "finance",
            "severity": "info",
            "title": "Структура витрат за березень 2026",
            "body": "Оренда: 1200 EUR (65%), Одяг: 210 EUR (11%), "
                    "Комунальні: 130.50 EUR (7%), Продукти: 177.50 EUR (10%), "
                    "Решта: 135 EUR (7%).",
        },
        {
            "domain": "finance",
            "severity": "success",
            "title": "Витрати на продукти стабільні",
            "body": "Два походи в супермаркет на загальну суму 177.50 EUR — "
                    "це в межах норми для місяця.",
        },
        {
            "domain": "finance",
            "severity": "warning",
            "title": "Тренд зростання витрат",
            "body": "За останні два місяці витрати зросли з 1640 до 1853 EUR. "
                    "Якщо тренд збережеться, варто переглянути бюджет на квітень.",
        },
    ], ensure_ascii=False)

    q = TEST_QUESTIONS[0]
    result = evaluate_response(sample_response, q["page"], q["context"])
    print_result(result, q)
    return [result]


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--sample":
        # Offline test with built-in sample
        print("Running offline evaluation with sample response...")
        results = run_eval_with_sample()
    elif len(sys.argv) > 1:
        # Evaluate a response from file
        filepath = sys.argv[1]
        with open(filepath, "r") as f:
            raw = f.read()
        cleaned = extract_json_from_response(raw)
        # Default to first test question if no args
        page = sys.argv[2] if len(sys.argv) > 2 else "finance"
        context = ""
        q_info = {"id": 0, "question": filepath, "page": page}
        for q in TEST_QUESTIONS:
            if q["page"] == page:
                context = q["context"]
                q_info = q
                break
        result = evaluate_response(cleaned, page, context)
        print_result(result, q_info)
        results = [result]
    else:
        # Full evaluation through ollama
        print(f"Running full evaluation against '{OLLAMA_MODEL}'...")
        print(f"5 test questions, max 15 points each.\n")
        results = run_eval_with_ollama()

    print_summary(results)
    compare_with_previous(results)
    save_results(results)
