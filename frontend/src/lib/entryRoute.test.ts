import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveEntryRouteRedirect } from './entryRoute'

test('resolveEntryRouteRedirect keeps routes unchanged while bootstrap is loading', () => {
  assert.equal(resolveEntryRouteRedirect({
    loading: true,
    hasUser: true,
    selectedCityId: null,
    route: 'shop',
  }), null)
})

test('resolveEntryRouteRedirect allows shop browsing without selected city', () => {
  assert.equal(resolveEntryRouteRedirect({
    loading: false,
    hasUser: true,
    selectedCityId: null,
    route: 'shop',
  }), null)
})

test('resolveEntryRouteRedirect keeps users with selected city out of city select route', () => {
  assert.equal(resolveEntryRouteRedirect({
    loading: false,
    hasUser: true,
    selectedCityId: 1,
    route: 'city_select',
  }), '/shop')
})

test('resolveEntryRouteRedirect keeps anonymous flow unchanged', () => {
  assert.equal(resolveEntryRouteRedirect({
    loading: false,
    hasUser: false,
    selectedCityId: null,
    route: 'shop',
  }), null)
})
