"""Cobee (by Pluxee) integration — import benefit transactions via JSON export.

Cobee API enforces CORS at WAF level, so API calls only work from app.cobee.io.
This module provides:
1. A bookmarklet (JS) that the user runs in their browser on app.cobee.io
   — it fetches transactions and downloads them as a JSON file
2. import_cobee_json() to process that JSON file and import transactions into PD

Usage:
    from src.cobee_integration import import_cobee_json, get_bookmarklet_js
    bookmarklet = get_bookmarklet_js(months=3)
    result = import_cobee_json(json_data, account_name="Cobee")
"""

import json
import logging
from datetime import datetime, timezone

from src.database import add_transaction, get_existing_external_ids

_log = logging.getLogger(__name__)

API_BASE = "https://api.cobee.io"

# ── Cobee benefit type → PD category mapping ─────────────────────────────

_BENEFIT_CATEGORY: dict[str, str] = {
    "meal": "Відпочинок / ресторан та смаколики",
    "transport": "Транспорт",
    "nursery": "Харчування і необхідне",
    "training": "На себе",
    "health-insurance": "Медицина",
    "life-insurance": "Медицина",
    "pension-plan": "Медицина",
}

_DEFAULT_CATEGORY = "хз виділені категорії"

# ── Description-based smart categorization for Cobee ──────────────────────

_COBEE_PATTERNS: list[tuple[list[str], str]] = [
    (["glovo", "uber eats", "just eat", "deliveroo"],
     "Відпочинок / ресторан та смаколики"),
    (["uber", "bolt", "cabify", "taxi", "metro", "bus", "renfe"],
     "Транспорт"),
    (["mercadona", "lidl", "carrefour", "aldi", "dia", "alcampo"],
     "Харчування і необхідне / Супермаркет"),
]


def cobee_categorize(benefit: str, description: str) -> str:
    """Map Cobee benefit type + description to PD category."""
    desc_lower = (description or "").lower()

    # Description patterns first (more specific)
    for patterns, category in _COBEE_PATTERNS:
        if any(p in desc_lower for p in patterns):
            return category

    # Fall back to benefit type
    return _BENEFIT_CATEGORY.get(benefit, _DEFAULT_CATEGORY)


# ── Bookmarklet JS generator ─────────────────────────────────────────────

def get_bookmarklet_js(months: int = 3) -> str:
    """Return JavaScript code for the Cobee export bookmarklet.

    The user drags this to their bookmarks bar, then clicks it while on
    app.cobee.io/transactions. It fetches transaction data and downloads
    a JSON file that can be uploaded to PD.
    """
    return f"""(async()=>{{
try{{
const API='https://api.cobee.io';
const H={{'Accept':'application/json','Content-Type':'application/json','x-client':'Employee-Web-App'}};
const tk=Object.keys(localStorage).find(k=>k.includes('auth0'));
if(tk){{const d=JSON.parse(localStorage[tk]);if(d.body&&d.body.access_token)H['Authorization']='Bearer '+d.body.access_token;}}
if(!H['Authorization']){{
const ck=document.cookie.split(';').map(c=>c.trim()).find(c=>c.startsWith('auth0'));
if(!ck){{alert('Cobee Export: не вдалося знайти токен. Переконайтесь що ви залогінені.');return;}}
}}
const r=await fetch(API+'/v1/employees/employment/me',{{headers:H}});
if(!r.ok){{alert('Cobee Export: помилка API ('+r.status+'). Перезалогіньтесь і спробуйте знову.');return;}}
const emp=await r.json();
const empId=emp.employmentId;
const cr=await fetch(API+'/v1/employee/'+empId+'/company/payroll-cycles',{{headers:H}});
const cycles=await cr.json();
const toFetch=cycles.slice(0,{months});
let allTx=[];
for(const c of toFetch){{
const tr=await fetch(API+'/v2/employees/'+empId+'/payrolls/'+c.id+'/transactions',{{headers:H}});
if(tr.ok){{const d=await tr.json();const txs=(d.content||d).transactions||[];allTx=allTx.concat(txs);}}
}}
const out={{exportDate:new Date().toISOString(),employeeId:empId,months:{months},transactions:allTx}};
const blob=new Blob([JSON.stringify(out,null,2)],{{type:'application/json'}});
const a=document.createElement('a');
a.href=URL.createObjectURL(blob);
a.download='cobee_export_'+new Date().toISOString().slice(0,10)+'.json';
a.click();
alert('Cobee Export: '+allTx.length+' транзакцій завантажено!');
}}catch(e){{alert('Cobee Export error: '+e.message);}}
}})()"""


def get_bookmarklet_href(months: int = 3) -> str:
    """Return a javascript: URL for the bookmarklet."""
    return "javascript:" + get_bookmarklet_js(months).replace("\n", "")


# ── Import from JSON ─────────────────────────────────────────────────────

def import_cobee_json(
    data: dict | list,
    account_name: str = "Cobee",
    since_date: str | None = None,
) -> dict:
    """Import Cobee transactions from exported JSON data.

    Args:
        data: Parsed JSON from the bookmarklet export.
              Expected format: {"transactions": [...]} or [...]
        account_name: Account name for imported transactions
        since_date: Only import transactions on or after this date (YYYY-MM-DD)

    Returns:
        dict with keys: synced, skipped, errors, total_found
    """
    result = {"synced": 0, "skipped": 0, "errors": 0, "total_found": 0}

    # Extract transactions from various formats
    if isinstance(data, list):
        all_transactions = data
    elif isinstance(data, dict):
        all_transactions = data.get("transactions", [])
        # Support nested content format from API
        if not all_transactions and "content" in data:
            content = data["content"]
            if isinstance(content, dict):
                all_transactions = content.get("transactions", [])
    else:
        return result

    result["total_found"] = len(all_transactions)

    # Batch-load existing external IDs to avoid N+1 queries
    existing_ids = get_existing_external_ids("cobee_")

    for tx in all_transactions:
        if not isinstance(tx, dict):
            result["errors"] += 1
            continue

        tx_id = tx.get("id", "")
        if not tx_id:
            result["errors"] += 1
            continue

        ext_id = f"cobee_{tx_id}"

        # Skip rejected transactions
        state = tx.get("state", "")
        if state == "rejected":
            result["skipped"] += 1
            continue

        # Dedup
        if ext_id in existing_ids:
            result["skipped"] += 1
            continue

        try:
            # Amount in cents → EUR
            amount_obj = tx.get("originalAmount", {})
            amount_cents = amount_obj.get("amountInCents", 0)
            amount = abs(amount_cents) / 100.0
            currency = "€"  # Cobee is always EUR

            # Date
            iso_time = tx.get("userTransactionIsoTime", "")
            if iso_time:
                tx_date = datetime.fromisoformat(
                    iso_time.replace("Z", "+00:00")
                ).strftime("%Y-%m-%d")
            else:
                continue

            # Skip transactions before since_date
            if since_date and tx_date < since_date:
                result["skipped"] += 1
                continue

            # Category from benefit type + description
            benefit = tx.get("benefit", "")
            concept = tx.get("concept", "")
            merchant_name = ""
            merchant = tx.get("merchant")
            if isinstance(merchant, dict):
                merchant_name = merchant.get("name", "")

            description = concept or merchant_name or ""
            category = cobee_categorize(benefit, description)

            # Cobee transactions are always expenses (benefit spending)
            add_transaction(
                date=tx_date,
                tx_type="EXPENSE",
                account=account_name,
                category=category,
                amount_original=amount,
                currency_original=currency,
                amount_eur=amount,
                nbu_rate=1.0,
                description=description,
                external_id=ext_id,
                source="cobee",
            )
            result["synced"] += 1

        except Exception as e:
            _log.error("Failed to process Cobee tx %s: %s", tx_id, e)
            result["errors"] += 1

    return result
