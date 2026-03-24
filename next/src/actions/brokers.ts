"use server";

// Broker functions are split into separate modules:
// - brokers-ibkr.ts — IBKR functions
// - brokers-trading212.ts — Trading 212 functions
// - brokers-etorro.ts — eTorro functions
// - brokers-common.ts — shared utilities (FX, getInvestmentsSummary)
//
// Import directly from the specific module, e.g.:
//   import { getInvestmentsSummary } from "@/actions/brokers-common";
//   import { syncIbkrToDb } from "@/actions/brokers-ibkr";
