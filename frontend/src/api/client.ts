import type { BootstrapResponse, Cart, ProductDetail, ProductSummary, TelegramIdentity, UserProfile } from '../types'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api'

async function request<T>(path: string, init?: RequestInit) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }))
    throw new Error(error.message ?? 'Request failed')
  }

  return (await response.json()) as T
}

export const api = {
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
  getCart(telegramId: string) {
    return request<{ cart: Cart; recommended: ProductSummary[] }>(`/cart?telegramId=${telegramId}`)
  },
  updateCity(telegramId: string, cityId: number) {
    return request<{ user: UserProfile }>(`/users/${telegramId}/city`, {
      method: 'PATCH',
      body: JSON.stringify({ cityId }),
    })
  },
  addCartItem(payload: { telegramId: string; productCityId: number; quantity: number }) {
    return request<{ cart: Cart; recommended: ProductSummary[] }>('/cart/items', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  updateCartItem(itemId: number, payload: { telegramId: string; quantity: number }) {
    return request<{ cart: Cart; recommended: ProductSummary[] }>(`/cart/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  },
  removeCartItem(itemId: number, telegramId: string) {
    return request<{ cart: Cart; recommended: ProductSummary[] }>(`/cart/items/${itemId}?telegramId=${telegramId}`, {
      method: 'DELETE',
    })
  },
}
