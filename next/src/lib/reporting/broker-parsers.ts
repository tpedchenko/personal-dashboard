/**
 * Parsers for broker tax reports (IBKR, Trading 212, eTorro).
 * Extract investment income data for IRPF calculation.
 */

export interface BrokerTaxTransaction {
  date: string;
  type: "DIVIDEND" | "INTEREST" | "CAPITAL_GAIN" | "CAPITAL_LOSS" | "FEE" | "WITHHOLDING";
  symbol: string;
  description: string;
  amount: number;
  currency: string;
  withheldTax: number;
}

export interface BrokerTaxReport {
  broker: string;
  year: number;
  dividends: number;
  interestIncome: number;
  realizedGains: number;
  realizedLosses: number;
  withheldTax: number;
  fees: number;
  transactions: BrokerTaxTransaction[];
}

// ─── IBKR Auto-detect format (CSV or PDF text) ──────────────────────────────

export function parseIbkrReport(text: string, year: number): BrokerTaxReport {
  // Auto-detect: PDF text has "Certificate of Income Tax" or "FX Income Worksheet"
  if (/Certificate\s+of\s+Income\s+Tax/i.test(text) || /FX\s+Income\s+Worksheet/i.test(text) || text.includes("R185")) {
    return parseIbkrPdfReport(text, year);
  }
  return parseIbkrCsvReport(text, year);
}

// ─── IBKR PDF Report Parser ─────────────────────────────────────────────────

function parseIbkrPdfReport(text: string, year: number): BrokerTaxReport {
  const transactions: BrokerTaxTransaction[] = [];
  let dividends = 0;
  let interestIncome = 0;
  let realizedGains = 0;
  let realizedLosses = 0;
  let withheldTax = 0;
  let fees = 0;

  // Parse Certificate of Income Tax (R185 form)
  // PDF text has amounts on separate lines after the header: e.g. "22.464.49\n17.97"
  // or "22,464.49\n17.97" — amounts separated by newlines
  if (/Certificate\s+of\s+Income\s+Tax/i.test(text) || text.includes("R185")) {
    // Find numbers that look like monetary amounts near the key section
    // Pattern: numbers like 22.464.49 or 22,464.49 (gross > tax > net on consecutive lines)
    // Filter to lines that look like monetary amounts (contain a dot with 2 decimal digits)
    const amountLines = text.match(/^\s*[\d,.]+\s*$/gm)
      ?.map(s => s.trim())
      .filter(s => /\.\d{2}$/.test(s) && s.length > 3);
    if (amountLines && amountLines.length >= 1) {
      // Parse amounts — handle format like "22.464.49" (dots as thousand sep, last .XX as cents)
      const parseR185Amount = (s: string): number => {
        // "22.464.49" → 22464.49, "17.97" → 17.97
        const parts = s.split(".");
        if (parts.length <= 2) return parseFloat(s.replace(/,/g, "")) || 0;
        // Last part is decimals, rest are integer parts
        const decimals = parts.pop()!;
        return parseFloat(parts.join("") + "." + decimals) || 0;
      };
      const grossAmount = parseR185Amount(amountLines[0]);
      const taxAmount = amountLines.length >= 2 ? parseR185Amount(amountLines[1]) : 0;

      if (grossAmount > 0) {
        dividends += grossAmount;
        transactions.push({
          date: `${year}-01-01`, type: "DIVIDEND", symbol: "IBKR",
          description: "Annual interest/dividend payment (Certificate R185)",
          amount: grossAmount, currency: "EUR", withheldTax: taxAmount,
        });
      }
      if (taxAmount > 0) {
        withheldTax += taxAmount;
        transactions.push({
          date: `${year}-01-01`, type: "WITHHOLDING", symbol: "IBKR",
          description: "Irish withholding tax (20%)",
          amount: 0, currency: "EUR", withheldTax: taxAmount,
        });
      }
    }
  }

  // Parse FX Income Worksheet — totals are concatenated: "Total16,336.2615,653.09683.17"
  if (text.includes("FX Income Worksheet")) {
    // Match "Total" or "Subtotal for USD" followed by 3 concatenated numbers
    const fxTotalMatch = text.match(/(?:Subtotal for \w+|Total)([\d,.]+)([\d,.]+)([\d,.()-]+)\s*$/m);
    if (fxTotalMatch) {
      // Numbers are glued together — split by detecting where decimal portions end
      // Try parsing the full match as 3 numbers by re-splitting
      const fullNums = fxTotalMatch[0].replace(/^(?:Subtotal for \w+|Total)/, "");
      // Match all number groups: digits with optional comma/dot separators
      const numMatches = fullNums.match(/[\d,]+\.\d{2}/g);
      if (numMatches && numMatches.length >= 3) {
        const fxProceeds = parseFloat(numMatches[0].replace(/,/g, ""));
        const fxCost = parseFloat(numMatches[1].replace(/,/g, ""));
        const fxIncome = parseFloat(numMatches[2].replace(/[(),]/g, ""));
        const isLoss = numMatches[2].includes("(");

        if (isLoss || fxIncome < 0) {
          realizedLosses += Math.abs(fxIncome);
        } else {
          realizedGains += fxIncome;
        }
        transactions.push({
          date: `${year}-12-31`,
          type: fxIncome >= 0 ? "CAPITAL_GAIN" : "CAPITAL_LOSS",
          symbol: "FX",
          description: `FX Income: proceeds ${fxProceeds.toFixed(2)} EUR, cost ${fxCost.toFixed(2)} EUR`,
          amount: Math.abs(fxIncome), currency: "EUR", withheldTax: 0,
        });
      }
    }
  }

  // Parse individual dividend lines from FX worksheet (Cash Dividend mentions)
  const divLines = text.matchAll(/Cash\s+Dividend\s+USD\s+([\d.]+)\s+per\s+Share(?:\s*-\s*(\w+)\s+Tax)?/g);
  // Already captured in FX totals, skip individual lines to avoid double counting

  return {
    broker: "IBKR",
    year,
    dividends: Math.round(dividends * 100) / 100,
    interestIncome: Math.round(interestIncome * 100) / 100,
    realizedGains: Math.round(realizedGains * 100) / 100,
    realizedLosses: Math.round(realizedLosses * 100) / 100,
    withheldTax: Math.round(withheldTax * 100) / 100,
    fees: Math.round(fees * 100) / 100,
    transactions,
  };
}

// ─── IBKR Annual Statement Parser (CSV) ──────────────────────────────────────

export function parseIbkrCsvReport(csvText: string, year: number): BrokerTaxReport {
  const transactions: BrokerTaxTransaction[] = [];
  let dividends = 0;
  let interestIncome = 0;
  let realizedGains = 0;
  let realizedLosses = 0;
  let withheldTax = 0;
  let fees = 0;

  const lines = csvText.split("\n");
  let section = "";

  for (const line of lines) {
    const cols = line.split(",").map(c => c.replace(/"/g, "").trim());
    if (cols.length < 2) continue;

    // Detect section headers
    if (cols[0] === "Dividends" && cols[1] === "Header") {
      section = "dividends";
      continue;
    }
    if (cols[0] === "Withholding Tax" && cols[1] === "Header") {
      section = "withholding";
      continue;
    }
    if (cols[0] === "Interest" && cols[1] === "Header") {
      section = "interest";
      continue;
    }
    if (cols[0] === "Realized & Unrealized Performance Summary" && cols[1] === "Header") {
      section = "realized";
      continue;
    }
    if (cols[0] === "Fees" && cols[1] === "Header") {
      section = "fees";
      continue;
    }
    if (cols[1] === "Header" || cols[1] === "SubTotal" || cols[1] === "Total") {
      continue;
    }

    if (cols[1] !== "Data") continue;

    const amount = parseFloat(cols[cols.length - 1]) || parseFloat(cols[cols.length - 2]) || 0;

    if (section === "dividends" && amount !== 0) {
      const symbol = cols[3] || "";
      const desc = cols[4] || cols[3] || "";
      dividends += Math.abs(amount);
      transactions.push({
        date: cols[2] || "",
        type: "DIVIDEND",
        symbol,
        description: desc,
        amount: Math.abs(amount),
        currency: cols[2]?.length === 3 ? cols[2] : "EUR",
        withheldTax: 0,
      });
    }

    if (section === "withholding" && amount !== 0) {
      withheldTax += Math.abs(amount);
      transactions.push({
        date: cols[2] || "",
        type: "WITHHOLDING",
        symbol: cols[3] || "",
        description: cols[4] || "",
        amount: 0,
        currency: "EUR",
        withheldTax: Math.abs(amount),
      });
    }

    if (section === "interest" && amount !== 0) {
      interestIncome += Math.abs(amount);
      transactions.push({
        date: cols[2] || "",
        type: "INTEREST",
        symbol: "",
        description: cols[3] || "Interest",
        amount: Math.abs(amount),
        currency: "EUR",
        withheldTax: 0,
      });
    }

    if (section === "realized") {
      const realizedPnl = parseFloat(cols[cols.length - 3]) || 0;
      if (realizedPnl > 0) realizedGains += realizedPnl;
      else if (realizedPnl < 0) realizedLosses += Math.abs(realizedPnl);
    }

    if (section === "fees" && amount !== 0) {
      fees += Math.abs(amount);
    }
  }

  return {
    broker: "IBKR",
    year,
    dividends: Math.round(dividends * 100) / 100,
    interestIncome: Math.round(interestIncome * 100) / 100,
    realizedGains: Math.round(realizedGains * 100) / 100,
    realizedLosses: Math.round(realizedLosses * 100) / 100,
    withheldTax: Math.round(withheldTax * 100) / 100,
    fees: Math.round(fees * 100) / 100,
    transactions,
  };
}

// ─── Trading 212 Transaction History Parser (CSV) ────────────────────────────

export function parseTrading212Report(csvText: string, year: number): BrokerTaxReport {
  const transactions: BrokerTaxTransaction[] = [];
  let dividends = 0;
  let interestIncome = 0;
  let realizedGains = 0;
  let realizedLosses = 0;
  let withheldTax = 0;
  let fees = 0;

  const lines = csvText.split("\n");
  const header = lines[0]?.split(",").map(h => h.replace(/"/g, "").trim().toLowerCase()) || [];

  const idx = {
    action: header.indexOf("action"),
    time: header.indexOf("time"),
    ticker: header.indexOf("ticker"),
    name: header.indexOf("name"),
    result: header.indexOf("result (eur)") >= 0 ? header.indexOf("result (eur)") : header.indexOf("result"),
    total: header.indexOf("total (eur)") >= 0 ? header.indexOf("total (eur)") : header.indexOf("total"),
    withheld: header.indexOf("withholding tax") >= 0 ? header.indexOf("withholding tax") : header.indexOf("stamp duty"),
    currency: header.indexOf("currency (result)") >= 0 ? header.indexOf("currency (result)") : -1,
  };

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map(c => c.replace(/"/g, "").trim());
    if (cols.length < 3) continue;

    const action = (cols[idx.action] || "").toLowerCase();
    const amount = parseFloat(cols[idx.total] || cols[idx.result] || "0") || 0;
    const symbol = cols[idx.ticker] || "";
    const desc = cols[idx.name] || symbol;
    const date = cols[idx.time] || "";
    const wht = Math.abs(parseFloat(cols[idx.withheld] || "0") || 0);

    if (action.includes("dividend")) {
      dividends += Math.abs(amount);
      withheldTax += wht;
      transactions.push({ date, type: "DIVIDEND", symbol, description: desc, amount: Math.abs(amount), currency: "EUR", withheldTax: wht });
    } else if (action.includes("interest")) {
      interestIncome += Math.abs(amount);
      transactions.push({ date, type: "INTEREST", symbol: "", description: desc, amount: Math.abs(amount), currency: "EUR", withheldTax: 0 });
    } else if (action === "sell" || action === "market sell") {
      const result = parseFloat(cols[idx.result] || "0") || 0;
      if (result > 0) {
        realizedGains += result;
        transactions.push({ date, type: "CAPITAL_GAIN", symbol, description: desc, amount: result, currency: "EUR", withheldTax: 0 });
      } else if (result < 0) {
        realizedLosses += Math.abs(result);
        transactions.push({ date, type: "CAPITAL_LOSS", symbol, description: desc, amount: Math.abs(result), currency: "EUR", withheldTax: 0 });
      }
    }
  }

  return {
    broker: "TRADING212",
    year,
    dividends: Math.round(dividends * 100) / 100,
    interestIncome: Math.round(interestIncome * 100) / 100,
    realizedGains: Math.round(realizedGains * 100) / 100,
    realizedLosses: Math.round(realizedLosses * 100) / 100,
    withheldTax: Math.round(withheldTax * 100) / 100,
    fees: Math.round(fees * 100) / 100,
    transactions,
  };
}

// ─── eTorro Tax Report Parser (PDF or CSV) ───────────────────────────────────

export function parseEtorroReport(text: string, year: number): BrokerTaxReport {
  // Auto-detect: PDF text contains "Modelo 720" or "Modelo 721"
  if (/Modelo\s+72[01]/i.test(text)) {
    return parseEtorroPdfTaxReport(text, year);
  }
  return parseEtorroCsvReport(text, year);
}

// ─── eTorro Spanish Tax Report PDF (Modelo 720/721) ─────────────────────────

interface Modelo720Asset {
  category: string; // "C" (accounts) or "V" (shares)
  name: string;
  country: string;
  isin: string;
  valuation: number;
  currency: string;
  shares: number;
}

interface Modelo721Crypto {
  name: string;
  acronym: string;
  valuation: number;
  quantity: number;
  currency: string;
}

export interface EtorroTaxReportData {
  modelo720: {
    categoryC: { totalValuation: number; assets: Modelo720Asset[] };
    categoryV: { totalValuation: number; assets: Modelo720Asset[] };
  };
  modelo721: { totalValuation: number; assets: Modelo721Crypto[] };
}

function parseEtorroPdfTaxReport(text: string, year: number): BrokerTaxReport & { etorroTaxData?: EtorroTaxReportData } {
  const transactions: BrokerTaxTransaction[] = [];

  // --- Modelo 720 Category C (bank accounts) ---
  const catCAssets: Modelo720Asset[] = [];
  // Look for Category C section — amounts like "5,909.037,359.547,359.54"
  const catCMatch = text.match(/Category C:[\s\S]*?Total([\d,. ]+)/);
  let catCTotal = 0;
  if (catCMatch) {
    const nums = catCMatch[1].match(/[\d,]+\.\d{2}/g);
    if (nums && nums.length >= 1) {
      // Last number before Total is the tax relevant valuation
      catCTotal = parseFloat(nums[nums.length - 1].replace(/,/g, ""));
    }
  }

  // --- Modelo 720 Category V (shares) ---
  const catVAssets: Modelo720Asset[] = [];
  let catVTotal = 0;

  // Parse individual share rows: "23901040Share...ISIN{AssetName}{ISIN}...{valuation}{shares}{currency}"
  // Match pattern: accountId + Share + country + ISIN + name + ISIN code + amounts
  const shareRegex = /23901040Share.*?ISIN([\w\s.&]+?)([A-Z]{2}[\dA-Z]{8,12})\s*\n?\s*\(\)\s*(?:\d{2}\/\d{2}\/\d{4})?\s*([\d,.]+)\s*([\d,.]+)\s*([\d,.]+(?:\s*\[\d\])?)\s*([\d,.]+)\s*([A-Z]{3}\s*\/\s*[\d.]+)/g;
  let shareMatch;
  while ((shareMatch = shareRegex.exec(text)) !== null) {
    const name = shareMatch[1].trim();
    const isin = shareMatch[2];
    const taxVal = parseFloat((shareMatch[5] || "0").replace(/\s*\[\d\]/g, "").replace(/,/g, "")) || 0;
    const shares = parseFloat(shareMatch[6].replace(/,/g, "")) || 0;
    const currency = shareMatch[7].split("/")[0].trim();
    catVAssets.push({ category: "V", name, country: "", isin, valuation: taxVal, currency, shares });
  }

  // Parse Category V total from "Total" line
  // Find Total line in Category V section (between "Category V:" and "Modelo 721")
  const catVSection = text.match(/Category V:[\s\S]*?(?=Modelo 721|Disclaimer|$)/);
  const catVTotalMatch = catVSection?.[0].match(/Total([\d,.\s]+)/);
  if (catVTotalMatch) {
    const nums = catVTotalMatch[1].match(/[\d,]+\.\d{2}/g);
    if (nums && nums.length >= 1) {
      catVTotal = parseFloat(nums[nums.length - 1].replace(/,/g, ""));
    }
  }

  // --- Modelo 721 (Crypto) ---
  const cryptoAssets: Modelo721Crypto[] = [];
  let cryptoTotal = 0;

  // Extract M721 section text (use lastIndexOf to skip Table of Contents)
  const m721Start = text.lastIndexOf("Modelo 721: Informative tax return on Crypto");
  const m721Section = m721Start >= 0 ? text.substring(m721Start, m721Start + 1500) : "";

  // Parse crypto rows from M721 section
  const cryptoRegex = /23901040(\w+?)([A-Z]{3,5})(\d{2}\/\d{2}\/\d{4})n\/a([\d,.]+)([\d.]+)([A-Z]{3}\s*\/\s*[\d.]+)/g;
  let cryptoMatch;
  while ((cryptoMatch = cryptoRegex.exec(m721Section)) !== null) {
    const name = cryptoMatch[1];
    const acronym = cryptoMatch[2];
    const valuation = parseFloat(cryptoMatch[4].replace(/,/g, "")) || 0;
    const quantity = parseFloat(cryptoMatch[5]) || 0;
    const currency = cryptoMatch[6].split("/")[0].trim();
    cryptoAssets.push({ name, acronym, valuation, quantity, currency });
  }

  const m721TotalMatch = m721Section.match(/Total\s*\n?\s*([\d,.]+)/);
  if (m721TotalMatch) {
    cryptoTotal = parseFloat(m721TotalMatch[1].replace(/,/g, "")) || 0;
  }

  // Build summary transaction entries for display
  if (catCTotal > 0) {
    transactions.push({
      date: `${year}-12-31`, type: "INTEREST", symbol: "eToro Cash",
      description: `Modelo 720 Cat.C: Account balance ${catCTotal.toFixed(2)} EUR`,
      amount: catCTotal, currency: "EUR", withheldTax: 0,
    });
  }
  if (catVTotal > 0 || catVAssets.length > 0) {
    const total = catVTotal || catVAssets.reduce((s, a) => s + a.valuation, 0);
    transactions.push({
      date: `${year}-12-31`, type: "CAPITAL_GAIN", symbol: "eToro Shares",
      description: `Modelo 720 Cat.V: ${catVAssets.length} positions, total ${total.toFixed(2)} EUR`,
      amount: total, currency: "EUR", withheldTax: 0,
    });
  }
  if (cryptoTotal > 0 || cryptoAssets.length > 0) {
    const total = cryptoTotal || cryptoAssets.reduce((s, a) => s + a.valuation, 0);
    transactions.push({
      date: `${year}-12-31`, type: "CAPITAL_GAIN", symbol: "eToro Crypto",
      description: `Modelo 721: ${cryptoAssets.length} crypto assets, total ${total.toFixed(2)} EUR`,
      amount: total, currency: "EUR", withheldTax: 0,
    });
  }

  const etorroTaxData: EtorroTaxReportData = {
    modelo720: {
      categoryC: { totalValuation: catCTotal, assets: catCAssets },
      categoryV: { totalValuation: catVTotal || catVAssets.reduce((s, a) => s + a.valuation, 0), assets: catVAssets },
    },
    modelo721: { totalValuation: cryptoTotal || cryptoAssets.reduce((s, a) => s + a.valuation, 0), assets: cryptoAssets },
  };

  return {
    broker: "ETORRO",
    year,
    dividends: 0,
    interestIncome: catCTotal,
    realizedGains: (catVTotal || catVAssets.reduce((s, a) => s + a.valuation, 0)) + (cryptoTotal || cryptoAssets.reduce((s, a) => s + a.valuation, 0)),
    realizedLosses: 0,
    withheldTax: 0,
    fees: 0,
    transactions,
    etorroTaxData,
  };
}

// ─── eTorro Account Statement Parser (CSV) ───────────────────────────────────

function parseEtorroCsvReport(csvText: string, year: number): BrokerTaxReport {
  const transactions: BrokerTaxTransaction[] = [];
  let dividends = 0;
  let interestIncome = 0;
  let realizedGains = 0;
  let realizedLosses = 0;
  let withheldTax = 0;
  let fees = 0;

  const lines = csvText.split("\n");
  const header = lines[0]?.split(",").map(h => h.replace(/"/g, "").trim().toLowerCase()) || [];

  const idx = {
    date: header.findIndex(h => h.includes("date")),
    type: header.findIndex(h => h === "type" || h.includes("action")),
    amount: header.findIndex(h => h === "amount" || h.includes("net")),
    symbol: header.findIndex(h => h.includes("instrument") || h.includes("asset")),
    details: header.findIndex(h => h.includes("details") || h.includes("description")),
  };

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map(c => c.replace(/"/g, "").trim());
    if (cols.length < 3) continue;

    const type = (cols[idx.type] || "").toLowerCase();
    const amount = Math.abs(parseFloat(cols[idx.amount] || "0") || 0);
    const symbol = cols[idx.symbol] || "";
    const date = cols[idx.date] || "";
    const desc = cols[idx.details] || symbol;

    if (type.includes("dividend")) {
      dividends += amount;
      transactions.push({ date, type: "DIVIDEND", symbol, description: desc, amount, currency: "USD", withheldTax: 0 });
    } else if (type.includes("interest")) {
      interestIncome += amount;
      transactions.push({ date, type: "INTEREST", symbol: "", description: desc, amount, currency: "USD", withheldTax: 0 });
    } else if (type.includes("profit") || type.includes("close")) {
      const rawAmount = parseFloat(cols[idx.amount] || "0") || 0;
      if (rawAmount > 0) {
        realizedGains += rawAmount;
        transactions.push({ date, type: "CAPITAL_GAIN", symbol, description: desc, amount: rawAmount, currency: "USD", withheldTax: 0 });
      } else if (rawAmount < 0) {
        realizedLosses += Math.abs(rawAmount);
        transactions.push({ date, type: "CAPITAL_LOSS", symbol, description: desc, amount: Math.abs(rawAmount), currency: "USD", withheldTax: 0 });
      }
    } else if (type.includes("fee") || type.includes("commission")) {
      fees += amount;
    }
  }

  return {
    broker: "ETORRO",
    year,
    dividends: Math.round(dividends * 100) / 100,
    interestIncome: Math.round(interestIncome * 100) / 100,
    realizedGains: Math.round(realizedGains * 100) / 100,
    realizedLosses: Math.round(realizedLosses * 100) / 100,
    withheldTax: Math.round(withheldTax * 100) / 100,
    fees: Math.round(fees * 100) / 100,
    transactions,
  };
}

// ─── Auto-detect and parse ───────────────────────────────────────────────────

export function parseBrokerReport(text: string, broker: string, year: number): BrokerTaxReport {
  switch (broker.toUpperCase()) {
    case "IBKR":
      return parseIbkrReport(text, year);
    case "TRADING212":
      return parseTrading212Report(text, year);
    case "ETORRO":
      return parseEtorroReport(text, year);
    default:
      throw new Error(`Unknown broker: ${broker}`);
  }
}
