import type { ProductSummary } from '../types'

type QuantityProduct = Pick<ProductSummary, 'stock' | 'minimumQuantity' | 'quantityStep' | 'maximumQuantity'>

export function getProductQuantityBounds(product: QuantityProduct) {
  const step = product.quantityStep > 0 ? product.quantityStep : 1
  const minimum = Math.max(product.minimumQuantity > 0 ? product.minimumQuantity : step, step)
  const maximumByRules = product.maximumQuantity > 0 ? product.maximumQuantity : product.stock
  const maximum = Math.max(0, Math.min(maximumByRules, product.stock))
  const canOrder = maximum >= minimum && product.stock > 0

  return {
    step,
    minimum: canOrder ? minimum : Math.max(0, maximum),
    maximum,
    canOrder,
  }
}

export function clampProductQuantity(product: QuantityProduct, quantity: number) {
  const { minimum, maximum, canOrder } = getProductQuantityBounds(product)

  if (!canOrder) {
    return 0
  }

  return Math.min(maximum, Math.max(minimum, quantity))
}
