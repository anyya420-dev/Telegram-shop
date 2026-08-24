import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeApiBaseUrl, resolveApiBaseUrl } from '../src/lib/apiConfig.js'

const PRODUCTION_API_URL = 'https://narcos-shop.onrender.com/api'

test('normalizeApiBaseUrl strips trailing slashes so paths never double up', () => {
  assert.equal(normalizeApiBaseUrl('https://narcos-shop.onrender.com/api/'), PRODUCTION_API_URL)
  assert.equal(normalizeApiBaseUrl('https://narcos-shop.onrender.com/api///'), PRODUCTION_API_URL)
  assert.equal(normalizeApiBaseUrl('  https://narcos-shop.onrender.com/api  '), PRODUCTION_API_URL)
})

test('production build uses VITE_API_URL verbatim', () => {
  const result = resolveApiBaseUrl(PRODUCTION_API_URL, true)
  assert.equal(result.error, null)
  assert.equal(result.baseUrl, PRODUCTION_API_URL)
  assert.equal(`${result.baseUrl}/session/bootstrap`, `${PRODUCTION_API_URL}/session/bootstrap`)
})

test('production build fails loudly when VITE_API_URL is missing', () => {
  for (const value of [undefined, '', '   ']) {
    const result = resolveApiBaseUrl(value, true)
    assert.equal(result.baseUrl, '')
    assert.match(result.error ?? '', /VITE_API_URL/)
  }
})

test('production build refuses a localhost API URL (no silent fallback)', () => {
  for (const value of [
    'http://localhost:3001/api',
    'http://127.0.0.1:3001/api',
    'https://localhost/api',
  ]) {
    const result = resolveApiBaseUrl(value, true)
    assert.equal(result.baseUrl, '')
    assert.match(result.error ?? '', /localhost/)
  }
})

test('production build refuses a relative API URL', () => {
  const result = resolveApiBaseUrl('/api', true)
  assert.equal(result.baseUrl, '')
  assert.match(result.error ?? '', /absolute/)
})

test('production build requires HTTPS and the /api path', () => {
  for (const [value, expectedPattern] of [
    ['http://narcos-shop.onrender.com/api', /HTTPS/],
    ['https://narcos-shop.onrender.com', /\/api/],
    ['https://narcos-shop.onrender.com/api/v1', /\/api/],
  ] as const) {
    const result = resolveApiBaseUrl(value, true)
    assert.equal(result.baseUrl, '')
    assert.match(result.error ?? '', expectedPattern)
  }
})

test('development falls back to the Vite proxy path', () => {
  assert.deepEqual(resolveApiBaseUrl(undefined, false), { baseUrl: '/api', error: null })
  assert.deepEqual(resolveApiBaseUrl('', false), { baseUrl: '/api', error: null })
  assert.deepEqual(resolveApiBaseUrl('http://localhost:3001/api', false), {
    baseUrl: 'http://localhost:3001/api',
    error: null,
  })
})
