import type { Language } from '../types'

const locales: Record<Language, string> = {
  ru: 'ru-RU',
  en: 'en-US',
}

export function formatCurrency(value: number, language: Language) {
  return new Intl.NumberFormat(locales[language], {
    style: 'currency',
    currency: 'PLN',
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatQuantity(value: number, language: Language) {
  const formatter = new Intl.NumberFormat(locales[language], {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
    maximumFractionDigits: 2,
  })

  return formatter.format(value)
}

export function buildQuantityOptions(minimum: number, step: number, maximum: number) {
  const values: number[] = []

  for (let current = minimum; current <= maximum + 0.0001; current += step) {
    values.push(Number(current.toFixed(2)))
  }

  return values
}
