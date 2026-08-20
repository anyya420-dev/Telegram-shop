import type { BootstrapResponse, Cart, ProductDetail, ProductSummary, TelegramIdentity, UserProfile } from '../types'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api'
let sessionToken: string | null = null

async function request<T>(path: string, init?: RequestInit) {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(sessionToken ? { Authorization: 'Bearer ' + sessionToken } : {}),
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }))
    throw new Error(error.message ?? 'Request failed')
  }

  return (await response.json()) as T
}

export const api = {
  setSessionToken(token: string | null) {
    sessionToken = token
  },
  bootstrap(payload: { initData: string; telegramUser: TelegramIdentity; isTelegramEnvironment: boolean }) {
    return request<BootstrapResponse>('/session/bootstrap', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  getCatalog(params: { cityId: number; search?: string; categoryId?: number | 'all' }) {
    const searchParams = new URLSearchParams({ cityId: String(params.cityId) })

    if (params.search) {
      searchParams.set('search', params.search)
    }

    if (params.categoryId && params.categoryId !== 'all') {
      searchParams.set('categoryId', String(params.categoryId))
    }

    return request<{ products: ProductSummary[] }>(`/catalog?${searchParams.toString()}`)
  },
  getProduct(productId: number, cityId: number) {
    return request<{ product: ProductDetail }>(`/products/${productId}?cityId=${cityId}`)
  },
  getCart() {
    return request<{ cart: Cart; recommended: ProductSummary[] }>('/cart')
  },
  updateCity(cityId: number) {
    return request<{ user: UserProfile }>('/users/city', {
      method: 'PATCH',
      body: JSON.stringify({ cityId }),
    })
  },
  addCartItem(payload: { productCityId: number; quantity: number }) {
    return request<{ cart: Cart; recommended: ProductSummary[] }>('/cart/items', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  updateCartItem(itemId: number, payload: { quantity: number }) {
    return request<{ cart: Cart; recommended: ProductSummary[] }>(`/cart/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  },
  removeCartItem(itemId: number) {
    return request<{ cart: Cart; recommended: ProductSummary[] }>(`/cart/items/${itemId}`, {
      method: 'DELETE',
    })
  },
}
