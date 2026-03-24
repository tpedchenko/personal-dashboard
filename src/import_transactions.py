"""Import financial transactions from CSV, Excel, OFX/QFX files."""

import uuid
import json
import re
import logging

import pandas as pd
from datetime import datetime

from src.database import (
    add_transaction, get_all_categories_flat, get_accounts,
    add_custom_category, add_custom_account, get_conn,
)
from src.db import _derive_owner

_log = logging.getLogger(__name__)

# Map ISO currency codes to symbols used in the DB
_CURRENCY_TO_SYMBOL = {
    "EUR": "€", "UAH": "₴", "USD": "$",
    "€": "€", "₴": "₴", "$": "$",
}


def _currency_symbol(code: str) -> str:
    """Convert currency code/symbol to DB symbol. Defaults to €."""
    return _CURRENCY_TO_SYMBOL.get(code.upper().strip(), "€")


def _convert_to_eur(amount: float, currency_symbol: str, date_str: str) -> tuple[float, float]:
    """Convert amount to EUR using NBU rates. Returns (amount_eur, nbu_rate).
    For EUR transactions returns (amount, 1.0)."""
    if currency_symbol == "€":
        return amount, 1.0
    try:
        from src.nbu import uah_to_eur, usd_to_eur
        if currency_symbol == "₴":
            amt_eur, rate = uah_to_eur(amount, date_str)
            if amt_eur is not None:
                return amt_eur, rate
        elif currency_symbol == "$":
            amt_eur, rate = usd_to_eur(amount, date_str)
            if amt_eur is not None:
                return amt_eur, rate
    except Exception:
        pass
    # Fallback: no conversion available
    return amount, 1.0


def parse_file(file_bytes: bytes, filename: str) -> pd.DataFrame:
    """Parse uploaded file into a raw DataFrame. Supports CSV, XLSX, XLS, OFX, QFX."""
    ext = filename.rsplit(".", 1)[-1].lower()
    if ext == "csv":
        return _parse_csv(file_bytes)
    elif ext in ("xlsx", "xls"):
        return _parse_excel(file_bytes, ext)
    elif ext in ("ofx", "qfx"):
        return _parse_ofx(file_bytes)
    else:
        raise ValueError(f"Unsupported file format: .{ext}")


def _parse_csv(file_bytes: bytes) -> pd.DataFrame:
    """Parse CSV with auto-detection of delimiter and encoding."""
    import io
    import csv

    # Try common encodings
    for enc in ("utf-8", "utf-8-sig", "cp1251", "latin-1"):
        try:
            text = file_bytes.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        text = file_bytes.decode("utf-8", errors="replace")

    # Auto-detect delimiter
    sniffer = csv.Sniffer()
    try:
        dialect = sniffer.sniff(text[:4096])
        sep = dialect.delimiter
    except csv.Error:
        sep = ","

    return pd.read_csv(io.StringIO(text), sep=sep)


def _parse_excel(file_bytes: bytes, ext: str) -> pd.DataFrame:
    """Parse Excel file."""
    import io
    engine = "openpyxl" if ext == "xlsx" else "xlrd"
    return pd.read_excel(io.BytesIO(file_bytes), engine=engine)


def _parse_ofx(file_bytes: bytes) -> pd.DataFrame:
    """Parse OFX/QFX file into standardized DataFrame."""
    from ofxparse import OfxParser
    import io

    ofx = OfxParser.parse(io.BytesIO(file_bytes))
    rows = []
    for acc in ofx.accounts:
        for tx in acc.statement.transactions:
            raw_amount = float(tx.amount)
            currency_raw = getattr(acc, "curdef", None) or "EUR"
            rows.append({
                "date": tx.date.strftime("%Y-%m-%d") if tx.date else None,
                "amount": raw_amount,
                "description": tx.memo or tx.payee or "",
                "type": "INCOME" if raw_amount > 0 else "EXPENSE",
                "external_id": f"ofx_{tx.id}" if tx.id else None,
                "currency": _currency_symbol(currency_raw),
            })
    return pd.DataFrame(rows)


def detect_columns_with_ai(df: pd.DataFrame, filename: str) -> dict | None:
    """Use Gemini to detect column mapping for CSV/Excel files.
    Returns dict like {"date": "col_name", "amount": "col_name", "description": "col_name", ...}
    or None if AI unavailable."""
    try:
        from src.ai_client import _gemini_generate
    except ImportError:
        return None

    sample = df.head(5).to_string()
    columns = list(df.columns)

    prompt = f"""Analyze this financial data file "{filename}".
Columns: {columns}
Sample data (first 5 rows):
{sample}

Determine which column maps to each of these fields:
- date (transaction date)
- amount (transaction amount, positive or negative)
- description (transaction description/memo)
- type (income/expense — may be inferred from amount sign if not explicit)
- currency (if present)
- account (if present)
- category (if present)

Return ONLY a JSON object with mappings like:
{{"date": "column_name", "amount": "column_name", "description": "column_name"}}
Only include fields that have a matching column. If amount is always positive and there's a separate type/direction column, include "type" mapping.
If amount sign indicates direction (negative=expense, positive=income), set "amount_sign_is_type": true."""

    contents = [{"role": "user", "parts": [{"text": prompt}]}]
    try:
        resp = _gemini_generate(contents, max_tokens=512)
    except Exception:
        return None
    if not resp:
        return None

    # Extract JSON from response
    match = re.search(r'\{[^}]+\}', resp, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    return None


def normalize_transactions(df: pd.DataFrame, mapping: dict) -> list[dict]:
    """Normalize DataFrame to standard transaction format using column mapping."""
    transactions = []
    amount_sign_is_type = mapping.get("amount_sign_is_type", False)

    for _, row in df.iterrows():
        try:
            # Date
            date_val = row.get(mapping.get("date", ""), "")
            if pd.isna(date_val):
                continue
            if isinstance(date_val, str):
                # Try common date formats
                for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y", "%m/%d/%Y", "%Y-%m-%d %H:%M:%S"):
                    try:
                        date_val = datetime.strptime(date_val.strip(), fmt).strftime("%Y-%m-%d")
                        break
                    except ValueError:
                        continue
                else:
                    date_val = str(date_val)[:10]
            elif hasattr(date_val, "strftime"):
                date_val = date_val.strftime("%Y-%m-%d")

            # Amount
            amount_raw = row.get(mapping.get("amount", ""), 0)
            if isinstance(amount_raw, str):
                amount_raw = amount_raw.replace(",", ".").replace(" ", "").replace("\xa0", "")
            amount = abs(float(amount_raw))

            # Type
            if amount_sign_is_type:
                tx_type = "INCOME" if float(amount_raw) > 0 else "EXPENSE"
            elif "type" in mapping:
                type_val = str(row.get(mapping["type"], "")).upper().strip()
                tx_type = "INCOME" if type_val in ("INCOME", "IN", "CREDIT", "CR", "+") else "EXPENSE"
            else:
                tx_type = "EXPENSE"

            # Description
            desc = str(row.get(mapping.get("description", ""), "") or "")
            if pd.isna(desc) or desc == "nan":
                desc = ""

            # Category
            category = str(row.get(mapping.get("category", ""), "") or "")
            if pd.isna(category) or category == "nan":
                category = ""

            # Currency — convert to DB symbol
            currency_raw = str(row.get(mapping.get("currency", ""), "EUR") or "EUR")
            if pd.isna(currency_raw) or currency_raw == "nan":
                currency_raw = "EUR"
            currency = _currency_symbol(currency_raw.strip())

            # Account
            account = str(row.get(mapping.get("account", ""), "") or "")
            if pd.isna(account) or account == "nan":
                account = ""

            # External ID
            external_id = row.get("external_id", None)
            if pd.isna(external_id):
                external_id = None

            transactions.append({
                "date": str(date_val),
                "amount": amount,
                "type": tx_type,
                "description": desc.strip(),
                "category": category.strip(),
                "currency": currency,
                "account": account.strip(),
                "external_id": external_id,
            })
        except (ValueError, TypeError):
            continue

    return transactions


def categorize_with_ai(transactions: list[dict], user_categories: list[str]) -> list[dict]:
    """Use AI to categorize uncategorized transactions. Returns transactions with updated categories."""
    try:
        from src.ai_client import _gemini_generate
    except ImportError:
        return transactions

    # Only categorize those without category
    uncategorized = [(i, tx) for i, tx in enumerate(transactions) if not tx.get("category")]
    if not uncategorized:
        return transactions

    # Process in batches of 30
    batch_size = 30
    for batch_start in range(0, len(uncategorized), batch_size):
        batch = uncategorized[batch_start:batch_start + batch_size]

        tx_list = "\n".join(
            f"{j+1}. {tx['date']} | {tx['type']} | {tx['amount']:.2f} {tx['currency']} | {tx['description']}"
            for j, (_, tx) in enumerate(batch)
        )

        prompt = f"""Categorize these financial transactions.
Available categories: {', '.join(user_categories[:50])}

Transactions:
{tx_list}

Return ONLY a JSON array of category strings, one per transaction, in the same order.
If no category fits well, suggest a new descriptive category name.
Example: ["Food / Groceries", "Transport", "Entertainment"]"""

        contents = [{"role": "user", "parts": [{"text": prompt}]}]
        try:
            resp = _gemini_generate(contents, max_tokens=2048)
        except Exception:
            continue
        if not resp:
            continue

        match = re.search(r'\[.*?\]', resp, re.DOTALL)
        if match:
            try:
                categories = json.loads(match.group())
                for (idx, (orig_idx, _)), cat in zip(enumerate(batch), categories):
                    if isinstance(cat, str) and cat.strip():
                        transactions[orig_idx]["category"] = cat.strip()
            except (json.JSONDecodeError, TypeError):
                pass

    return transactions


def find_duplicates(transactions: list[dict]) -> list[bool]:
    """Check each transaction for duplicates in DB. Returns list of booleans (True = duplicate)."""
    duplicates = []

    with get_conn() as conn:
        for tx in transactions:
            # Check by external_id first
            if tx.get("external_id"):
                row = conn.execute(
                    "SELECT 1 FROM transactions WHERE external_id = ?",
                    (tx["external_id"],)
                ).fetchone()
                if row:
                    duplicates.append(True)
                    continue

            # Fuzzy: same date + similar amount
            row = conn.execute(
                "SELECT 1 FROM transactions WHERE date = ? AND ABS(amount_original - ?) < 0.02",
                (tx["date"], tx["amount"])
            ).fetchone()
            duplicates.append(bool(row))

    return duplicates


def execute_import(transactions: list[dict], default_account: str, batch_id: str | None = None) -> dict:
    """Import selected transactions into DB. Returns stats dict.

    Uses a single DB connection and bulk-prepares rows for insertion
    instead of calling add_transaction() per row.
    """
    if not batch_id:
        batch_id = f"import_{uuid.uuid4().hex[:8]}"

    imported = 0
    errors = 0

    # Pre-validate and prepare all rows
    prepared_rows: list[tuple] = []
    row_descriptions: list[str] = []

    for tx in transactions:
        try:
            account = tx.get("account") or default_account
            category = tx.get("category") or "Other"
            currency = tx.get("currency", "€")
            amount = tx["amount"]
            date_str = tx["date"]

            # Validate (same checks as add_transaction)
            if amount is not None and amount <= 0:
                raise ValueError("amount must be positive")
            if currency and currency not in ("€", "₴", "$"):
                raise ValueError(f"invalid currency: {currency}")

            dt = pd.to_datetime(date_str)
            sub_type = "INCOME" if tx["type"] == "INCOME" else "EXPENSE_PERSONAL"
            owner = _derive_owner(account)

            # Convert to EUR
            amount_eur, nbu_rate = _convert_to_eur(amount, currency, date_str)

            if amount_eur is not None and amount_eur <= 0:
                raise ValueError("amount_eur must be positive")

            prepared_rows.append((
                dt.strftime("%Y-%m-%d"),
                dt.year,
                dt.month,
                tx["type"],
                sub_type,
                account,
                category,
                amount,
                currency,
                amount_eur,
                nbu_rate,
                tx.get("description", ""),
                owner,
                tx.get("external_id"),
                "file_import",
            ))
            row_descriptions.append(tx.get("description", ""))
        except Exception as e:
            _log.warning("Import error for tx %s: %s", tx.get("description", ""), e)
            errors += 1

    # Bulk insert with a single connection, handling individual row errors
    if prepared_rows:
        sql = """
            INSERT INTO transactions
            (date, year, month, type, sub_type, account, category,
             amount_original, currency_original, amount_eur, nbu_rate_eur_used,
             description, owner, external_id, source)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        with get_conn() as conn:
            try:
                conn.executemany(sql, prepared_rows)
                imported = len(prepared_rows)
            except Exception:
                # Bulk insert failed — fall back to row-by-row within same connection
                _log.info("Bulk insert failed, falling back to row-by-row insert")
                for i, row in enumerate(prepared_rows):
                    try:
                        conn.execute(sql, row)
                        imported += 1
                    except Exception as e:
                        _log.warning("Import error for tx %s: %s", row_descriptions[i], e)
                        errors += 1

    return {"imported": imported, "errors": errors, "batch_id": batch_id}
