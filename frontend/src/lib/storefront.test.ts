import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clampProductQuantity, getProductQuantityBounds } from './storefront'

test('getProductQuantityBounds clamps quantity to available stock', () => {
  const bounds = getProductQuantityBounds({
    stock: 3,
    minimumQuantity: 1,
    quantityStep: 1,
    maximumQuantity: 10,
  })

  assert.deepEqual(bounds, {
    step: 1,
    minimum: 1,
    maximum: 3,
    canOrder: true,
  })
})

test('getProductQuantityBounds marks sold out products as unavailable', () => {
  const bounds = getProductQuantityBounds({
    stock: 0,
    minimumQuantity: 1,
    quantityStep: 1,
    maximumQuantity: 5,
  })

  assert.deepEqual(bounds, {
    step: 1,
    minimum: 0,
    maximum: 0,
    canOrder: false,
  })
})

test('clampProductQuantity keeps requested quantity inside valid bounds', () => {
  const product = {
    stock: 8,
    minimumQuantity: 2,
    quantityStep: 2,
    maximumQuantity: 6,
  }

  assert.equal(clampProductQuantity(product, 1), 2)
  assert.equal(clampProductQuantity(product, 4), 4)
  assert.equal(clampProductQuantity(product, 12), 6)
})
