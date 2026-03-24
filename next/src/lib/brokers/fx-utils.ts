// FX utility functions (not server actions)

export const FALLBACK_TO_EUR: Record<string, number> = {
  GBP: 1.17, SEK: 0.087, NOK: 0.085, DKK: 0.13, CHF: 1.05,
  PLN: 0.23, CZK: 0.04, HUF: 0.0025, RON: 0.2, BGN: 0.51,
  HRK: 0.13, TRY: 0.027, ZAR: 0.05, BRL: 0.17, MXN: 0.052,
  JPY: 0.006, CNY: 0.13, INR: 0.011, KRW: 0.00068, AUD: 0.6,
  CAD: 0.68, NZD: 0.56, SGD: 0.69, HKD: 0.12, TWD: 0.029,
};

export function toEur(amount: number, currency: string, usdToEur: number, fxCache: Record<string, number>): number {
  if (currency === "EUR" || currency === "BASE") return amount;
  if (currency === "USD") return amount * usdToEur;
  if (currency === "HKD") return amount * usdToEur / 7.8;
  if (fxCache[currency]) return amount * fxCache[currency];
  if (FALLBACK_TO_EUR[currency]) return amount * FALLBACK_TO_EUR[currency];
  return amount * usdToEur;
}
