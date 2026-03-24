/**
 * Monobank CSV transaction parser.
 * Parses the Ukrainian Monobank CSV export format with MCC-based categorization.
 */

import {
  type ParsedTransaction,
  decodeText,
  detectDelimiter,
  parseCSVLines,
  parseDate,
  parseAmount,
  normalizeCurrency,
} from "./shared";

// ---------------------------------------------------------------------------
// MCC to category mapping
// ---------------------------------------------------------------------------

const MCC_CATEGORY_MAP: Record<string, string> = {
  "5411": "Food / Groceries",
  "5412": "Food / Groceries",
  "5422": "Food / Groceries",
  "5441": "Food / Groceries",
  "5451": "Food / Groceries",
  "5462": "Food / Groceries",
  "5499": "Food / Groceries",
  "5812": "Food / Restaurants",
  "5813": "Food / Restaurants",
  "5814": "Food / Restaurants",
  "4011": "Transport",
  "4111": "Transport",
  "4112": "Transport",
  "4121": "Transport",
  "4131": "Transport",
  "4784": "Transport",
  "5541": "Transport / Fuel",
  "5542": "Transport / Fuel",
  "5172": "Transport / Fuel",
  "5912": "Health / Pharmacy",
  "5122": "Health / Pharmacy",
  "8011": "Health / Medical",
  "8021": "Health / Medical",
  "8031": "Health / Medical",
  "8041": "Health / Medical",
  "8042": "Health / Medical",
  "8043": "Health / Medical",
  "8049": "Health / Medical",
  "8050": "Health / Medical",
  "8062": "Health / Medical",
  "8071": "Health / Medical",
  "8099": "Health / Medical",
  "5944": "Shopping",
  "5945": "Shopping",
  "5947": "Shopping",
  "5311": "Shopping",
  "5331": "Shopping",
  "5399": "Shopping",
  "5651": "Shopping / Clothes",
  "5691": "Shopping / Clothes",
  "5699": "Shopping / Clothes",
  "5611": "Shopping / Clothes",
  "5621": "Shopping / Clothes",
  "5641": "Shopping / Clothes",
  "5655": "Shopping / Clothes",
  "5661": "Shopping / Clothes",
  "5732": "Shopping / Electronics",
  "5734": "Shopping / Electronics",
  "5946": "Shopping / Electronics",
  "7832": "Entertainment",
  "7911": "Entertainment",
  "7922": "Entertainment",
  "7929": "Entertainment",
  "7933": "Entertainment",
  "7941": "Entertainment",
  "7991": "Entertainment",
  "7993": "Entertainment",
  "7994": "Entertainment",
  "7995": "Entertainment",
  "7996": "Entertainment",
  "7999": "Entertainment",
  "4722": "Travel",
  "3000": "Travel",
  "3001": "Travel",
  "7011": "Travel / Hotels",
  "7012": "Travel / Hotels",
  "5211": "Home / Hardware",
  "5231": "Home / Hardware",
  "5251": "Home / Hardware",
  "5261": "Home / Hardware",
  "5712": "Home / Furniture",
  "5713": "Home / Furniture",
  "5714": "Home / Furniture",
  "5719": "Home / Furniture",
  "4814": "Utilities / Telecom",
  "4816": "Utilities / Telecom",
  "4899": "Utilities",
  "4900": "Utilities",
  "6010": "Finance / ATM",
  "6011": "Finance / ATM",
  "6012": "Finance / Bank",
  "6051": "Finance / Transfer",
  "6211": "Finance / Investment",
  "6300": "Finance / Insurance",
  "8211": "Education",
  "8220": "Education",
  "8241": "Education",
  "8244": "Education",
  "8249": "Education",
  "8299": "Education",
  "7221": "Services / Photo",
  "7230": "Services / Beauty",
  "7251": "Services / Repair",
  "7261": "Services / Funeral",
  "7273": "Services / Dating",
  "7276": "Services / Tax",
  "7277": "Services",
  "7298": "Services / Spa",
  "7311": "Services / Advertising",
  "7321": "Services / Credit",
  "7333": "Services / Photo",
  "7338": "Services / Copy",
  "7339": "Services",
  "7342": "Services / Pest Control",
  "7349": "Services / Cleaning",
  "7361": "Services / Employment",
  "7372": "Services / Software",
  "7375": "Services / IT",
  "7379": "Services / IT",
  "7392": "Services / Consulting",
  "7393": "Services / Security",
  "7394": "Services / Rental",
  "7395": "Services / Photo",
  "7399": "Services",
  "7512": "Transport / Car Rental",
  "7523": "Transport / Parking",
  "7531": "Transport / Auto Repair",
  "7534": "Transport / Tires",
  "7535": "Transport / Auto Paint",
  "7538": "Transport / Auto Repair",
  "7542": "Transport / Car Wash",
  "5192": "Shopping / Books",
  "5940": "Shopping / Cycling",
  "5941": "Shopping / Sports",
  "5942": "Shopping / Books",
  "5943": "Shopping / Stationery",
  "5977": "Shopping / Beauty",
  "5995": "Shopping / Pets",
};

function categoryFromMcc(mcc: string): string {
  return MCC_CATEGORY_MAP[mcc] || "Other";
}

// ---------------------------------------------------------------------------
// Format detection & parsing
// ---------------------------------------------------------------------------

const MONO_HEADERS = [
  /дата/i,
  /деталі|операці/i,
  /mcc/i,
  /сума/i,
];

export function isMonobankFormat(buffer: ArrayBuffer): boolean {
  const text = decodeText(buffer);
  const firstLine = text.split("\n")[0] || "";
  return MONO_HEADERS.every((p) => p.test(firstLine));
}

export function parseMonobankCSV(buffer: ArrayBuffer): ParsedTransaction[] {
  const text = decodeText(buffer);
  const delimiter = detectDelimiter(text);
  const rows = parseCSVLines(text, delimiter);

  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => h.toLowerCase().trim());
  const transactions: ParsedTransaction[] = [];

  // Find columns by header patterns
  const dateIdx = headers.findIndex((h) => /дата/.test(h));
  const descIdx = headers.findIndex((h) => /деталі|операці/.test(h) && !/дата/.test(h));
  const mccIdx = headers.findIndex((h) => /mcc/.test(h));

  // Find "Сума в валюті картки" — the primary amount in card currency
  const amountIdx = headers.findIndex((h) => /сума.*валют.*картк/i.test(h));
  // Fallback: first "сума" column
  const amountFallback = amountIdx >= 0 ? amountIdx : headers.findIndex((h) => /сума/.test(h));

  // Currency column (right after amount)
  const currencyIdx = amountFallback >= 0 ? amountFallback + 1 : -1;

  // Balance column — "Залишок"
  const balanceIdx = headers.findIndex((h) => /залишок/.test(h));

  if (dateIdx === -1 || amountFallback === -1) {
    // Cannot parse, return empty
    return [];
  }

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 3) continue;

    const dateStr = parseDate(row[dateIdx] || "");
    if (!dateStr) continue;

    const rawAmount = parseAmount(row[amountFallback] || "0");
    if (rawAmount === 0) continue;

    const description = descIdx >= 0 ? (row[descIdx] || "") : "";
    const mcc = mccIdx >= 0 ? (row[mccIdx] || "").trim() : "";
    const currency = currencyIdx >= 0 && currencyIdx < row.length
      ? normalizeCurrency(row[currencyIdx] || "UAH")
      : "UAH";
    const balance = balanceIdx >= 0 ? parseAmount(row[balanceIdx] || "0") : undefined;

    const txType: "INCOME" | "EXPENSE" = rawAmount > 0 ? "INCOME" : "EXPENSE";
    const category = mcc ? categoryFromMcc(mcc) : "Other";

    transactions.push({
      date: dateStr,
      description: description.trim(),
      amount: Math.abs(rawAmount),
      type: txType,
      category,
      currency,
      account: "Monobank",
      mcc: mcc || undefined,
      balance: balance || undefined,
    });
  }

  return transactions;
}
