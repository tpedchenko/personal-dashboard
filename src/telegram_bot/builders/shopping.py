"""Shopping report builder — deduplicated from _send_shopping_report + callback variant."""
import logging

from src.database import get_shopping_items, mark_items_bought_bulk

logger = logging.getLogger(__name__)


def _build_shopping_report(user_name: str) -> tuple[str, int] | None:
    """Mark all items as bought and build report text.

    Returns (report_text, total_count) or None if the list was empty.
    """
    items = get_shopping_items(include_bought=False)
    bought = [i for i in get_shopping_items(include_bought=True) if i["bought_at"]]

    # Mark remaining as bought (bulk operation)
    if items:
        mark_items_bought_bulk([item["id"] for item in items], bought_by=user_name)

    all_bought = bought + items
    if not all_bought:
        return None

    lines = ["🛒 *Звіт по покупках*\n", "✅ *Куплено:*"]
    for item in all_bought:
        qty = f" ×{item['quantity']}" if item['quantity'] != "1" else ""
        lines.append(f"  ✓ {item['item_name']}{qty}")
    text = "\n".join(lines)

    return text, len(all_bought)
