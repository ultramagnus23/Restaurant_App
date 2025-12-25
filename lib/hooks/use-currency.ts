"use client"

import { useStore } from "@/lib/store"
import { convertCurrency, formatCurrency } from "@/lib/currency"

export function useCurrency() {
  const { currency, setCurrency } = useStore()

  const convert = (amountInINR: number) => {
    return convertCurrency(amountInINR, currency)
  }

  const format = (amountInINR: number) => {
    const converted = convert(amountInINR)
    return formatCurrency(converted, currency)
  }

  return {
    currency,
    setCurrency,
    convert,
    format,
  }
}
