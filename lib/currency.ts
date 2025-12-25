import type { Currency, CurrencyRate } from "./types"

// Base currency rates (relative to INR)
export const CURRENCY_RATES: Record<Currency, CurrencyRate> = {
  INR: { code: "INR", symbol: "₹", rate: 1, name: "Indian Rupee" },
  USD: { code: "USD", symbol: "$", rate: 0.012, name: "US Dollar" },
  EUR: { code: "EUR", symbol: "€", rate: 0.011, name: "Euro" },
  GBP: { code: "GBP", symbol: "£", rate: 0.0095, name: "British Pound" },
  AUD: { code: "AUD", symbol: "A$", rate: 0.018, name: "Australian Dollar" },
  CAD: { code: "CAD", symbol: "C$", rate: 0.016, name: "Canadian Dollar" },
  SGD: { code: "SGD", symbol: "S$", rate: 0.016, name: "Singapore Dollar" },
  AED: { code: "AED", symbol: "د.إ", rate: 0.044, name: "UAE Dirham" },
}

export function convertCurrency(amountInINR: number, targetCurrency: Currency): number {
  const rate = CURRENCY_RATES[targetCurrency].rate
  return Math.round(amountInINR * rate * 100) / 100
}

export function formatCurrency(amount: number, currency: Currency): string {
  const { symbol } = CURRENCY_RATES[currency]
  const formatted = amount.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
  return `${symbol}${formatted}`
}

export function getCurrencySymbol(currency: Currency): string {
  return CURRENCY_RATES[currency].symbol
}

export function getAllCurrencies(): CurrencyRate[] {
  return Object.values(CURRENCY_RATES)
}
