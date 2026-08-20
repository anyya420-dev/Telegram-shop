export function formatCurrency(value: number) {
  return new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency: 'PLN',
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatQuantity(value: number) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1)
}

export function buildQuantityOptions(minimum: number, step: number, maximum: number) {
  const values: number[] = []

  for (let current = minimum; current <= maximum + 0.0001; current += step) {
    values.push(Number(current.toFixed(2)))
  }

  return values
}
