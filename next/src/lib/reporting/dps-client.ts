/**
 * REST client for Ukrainian Tax Service (ДПС) Electronic Cabinet API.
 * Base URL: https://cabinet.tax.gov.ua/ws/public_api/
 * Docs: cabinet.tax.gov.ua/help/api.html
 */

import { getDpsAuthHeader } from "./dps-auth";

const DPS_BASE_URL = "https://cabinet.tax.gov.ua/ws/public_api";

// ─── Types ───

export interface DpsDeclarationListItem {
  docId: string;
  docType: string;
  period: string;
  year: number;
  status: string;
  submittedAt?: string;
  receiptNumber?: string;
}

export interface DpsBudgetBalance {
  year: number;
  accounts: Array<{
    csti: string;
    accountId: string;
    name: string;
    balance: number; // positive = overpayment, negative = debt
    currency: string;
  }>;
}

export interface DpsPayerCard {
  groups: Array<{
    groupId: number;
    name: string;
    data: Record<string, unknown>[];
  }>;
}

export interface DpsDebtInfo {
  totalDebt: number;
  items: Array<{
    name: string;
    amount: number;
    currency: string;
  }>;
}

export interface DpsConnectionStatus {
  connected: boolean;
  payerName?: string;
  fopGroup?: string;
  registrationDate?: string;
  error?: string;
}

// ─── Client ───

async function dpsRequest(
  userId: number,
  path: string,
  options?: { method?: string },
): Promise<Response> {
  const authHeader = await getDpsAuthHeader(userId);

  const res = await fetch(`${DPS_BASE_URL}${path}`, {
    method: options?.method || "GET",
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `DPS API error ${res.status}: ${text || res.statusText}`,
    );
  }

  return res;
}

/**
 * Test connection by fetching payer card.
 */
export async function testConnection(
  userId: number,
): Promise<DpsConnectionStatus> {
  try {
    const res = await dpsRequest(userId, "/payer_card");
    const data = await res.json();

    // Extract key info from payer card groups
    let payerName = "";
    let fopGroup = "";
    let registrationDate = "";

    if (Array.isArray(data)) {
      for (const group of data) {
        if (group.data && Array.isArray(group.data)) {
          for (const item of group.data) {
            if (item.name) payerName = payerName || String(item.name);
            if (item.fopGroup) fopGroup = String(item.fopGroup);
            if (item.registrationDate)
              registrationDate = String(item.registrationDate);
          }
        }
      }
    }

    return {
      connected: true,
      payerName,
      fopGroup,
      registrationDate,
    };
  } catch (e) {
    return {
      connected: false,
      error: e instanceof Error ? e.message : "Connection failed",
    };
  }
}

/**
 * Get list of submitted declarations for a year/month.
 */
export async function getDeclarationList(
  userId: number,
  year: number,
  month?: number,
): Promise<DpsDeclarationListItem[]> {
  let path = `/reg_doc/list?periodYear=${year}`;
  if (month) path += `&periodMonth=${month}`;

  const res = await dpsRequest(userId, path);
  const data = await res.json();

  if (!Array.isArray(data)) return [];

  return data.map((doc: Record<string, unknown>) => ({
    docId: String(doc.id || doc.docId || ""),
    docType: String(doc.type || doc.docType || ""),
    period: String(doc.period || ""),
    year: Number(doc.year || year),
    status: String(doc.status || ""),
    submittedAt: doc.submittedAt ? String(doc.submittedAt) : undefined,
    receiptNumber: doc.receiptNumber ? String(doc.receiptNumber) : undefined,
  }));
}

/**
 * Get declaration XML content.
 */
export async function getDeclarationXml(
  userId: number,
  year: number,
  docId: string,
): Promise<string> {
  const res = await dpsRequest(userId, `/reg_doc/doc/${year}/${docId}/xml`);
  return res.text();
}

/**
 * Get declaration PDF content as base64.
 */
export async function getDeclarationPdf(
  userId: number,
  year: number,
  docId: string,
): Promise<Buffer> {
  const res = await dpsRequest(userId, `/reg_doc/doc/${year}/${docId}/pdf`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Get budget balance (борг/переплата) for a year.
 */
export async function getBudgetBalance(
  userId: number,
  year: number,
): Promise<DpsBudgetBalance> {
  const res = await dpsRequest(userId, `/ta/splatp?year=${year}`);
  const data = await res.json();

  const accounts: DpsBudgetBalance["accounts"] = [];
  if (Array.isArray(data)) {
    for (const item of data) {
      accounts.push({
        csti: String(item.csti || ""),
        accountId: String(item.accountId || item.id || ""),
        name: String(item.name || item.taxName || ""),
        balance: Number(item.balance || item.saldo || 0),
        currency: "UAH",
      });
    }
  }

  return { year, accounts };
}

/**
 * Get payer card (full info about the taxpayer).
 */
export async function getPayerCard(userId: number): Promise<DpsPayerCard> {
  const res = await dpsRequest(userId, "/payer_card");
  const data = await res.json();

  const groups: DpsPayerCard["groups"] = [];
  if (Array.isArray(data)) {
    for (const group of data) {
      groups.push({
        groupId: Number(group.groupId || group.id || 0),
        name: String(group.name || group.title || ""),
        data: Array.isArray(group.data) ? group.data : [],
      });
    }
  }

  return { groups };
}

/**
 * Get debt information.
 */
export async function getDebtInfo(userId: number): Promise<DpsDebtInfo> {
  const res = await dpsRequest(userId, "/ta/debt");
  const data = await res.json();

  const items: DpsDebtInfo["items"] = [];
  let totalDebt = 0;

  if (Array.isArray(data)) {
    for (const item of data) {
      const amount = Number(item.amount || item.sum || 0);
      totalDebt += amount;
      items.push({
        name: String(item.name || item.taxName || ""),
        amount,
        currency: "UAH",
      });
    }
  }

  return { totalDebt, items };
}

/**
 * Get incoming correspondence from DPS.
 */
export async function getIncomingMail(
  userId: number,
  page: number = 0,
): Promise<Record<string, unknown>[]> {
  const res = await dpsRequest(userId, `/post/incoming?page=${page}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}
