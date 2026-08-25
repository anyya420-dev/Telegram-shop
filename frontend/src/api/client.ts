import { resolveApiBaseUrl } from '../lib/apiConfig'
import type {
  AdminCategory,
  AdminCity,
  AdminProduct,
  AdminSettingsResponse,
  AdminStats,
  Balance,
  BootstrapResponse,
  BotStatusResponse,
  Cart,
  City,
  Discount,
  Language,
  Order,
  ProductDetail,
  ProductSummary,
  Review,
  SupportTicket,
  UserProfile,
  WishlistItem,
} from '../types'

const ENV = (import.meta as ImportMeta & {
  env?: {
    PROD?: boolean
    VITE_API_URL?: string
  }
}).env ?? {}

const IS_PRODUCTION = Boolean(ENV.PROD)
const { baseUrl: API_URL, error: API_CONFIG_ERROR } = resolveApiBaseUrl(
  ENV.VITE_API_URL,
  IS_PRODUCTION,
)

export const apiBaseUrl = API_URL
export const apiConfigError = API_CONFIG_ERROR

// Loud, but non-fatal: throwing at module scope would abort evaluation of the
// whole bundle and leave the user with a blank screen instead of a diagnostic.
if (API_CONFIG_ERROR) {
  console.error('[api] Invalid production API configuration:', API_CONFIG_ERROR)
}

/** Safe diagnostics only — never logs initData, session tokens or admin tokens. */
export function getApiDiagnostics() {
  const telegramWebApp =
    typeof window === 'undefined'
      ? undefined
      : (window as Window & { Telegram?: { WebApp?: unknown } }).Telegram?.WebApp

  return {
    apiBaseUrl: API_URL,
    apiConfigured: !API_CONFIG_ERROR && API_URL.length > 0,
    apiConfigError: API_CONFIG_ERROR,
    mode: IS_PRODUCTION ? 'production' : 'development',
    pageOrigin: typeof window === 'undefined' ? null : window.location.origin,
    inTelegram: Boolean(telegramWebApp),
  }
}

let sessionToken: string | null = null
let adminToken: string | null = null

export class ApiError extends Error {
  code?: string
  status?: number

  constructor(message: string, code?: string, status?: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

const FALLBACK_CODE_BY_STATUS: Record<number, string> = {
  400: 'validation_failed',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  422: 'validation_failed',
  429: 'too_many_requests',
  500: 'server_error',
  502: 'server_unreachable',
  503: 'service_unavailable',
  504: 'request_timeout',
}

const REQUEST_TIMEOUT_MS = 20_000

/**
 * A browser reports a blocked CORS response and a genuinely offline network with
 * the exact same opaque `TypeError`. We can still distinguish the likely cause:
 * if the browser reports itself as offline it is a network problem, otherwise a
 * cross-origin request to a different origin was most likely blocked by CORS.
 */
function classifyFetchFailure(error: unknown): { code: string; message: string } {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return { code: 'request_timeout', message: 'Request timed out' }
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { code: 'network_error', message: 'Device is offline' }
  }

  const isCrossOrigin =
    /^https?:\/\//i.test(API_URL) &&
    typeof window !== 'undefined' &&
    !API_URL.toLowerCase().startsWith(window.location.origin.toLowerCase())

  if (isCrossOrigin) {
    return {
      code: 'cors_blocked',
      message: 'Request was blocked by the browser before a response was received',
    }
  }

  return { code: 'network_error', message: 'Network error' }
}

async function request<T>(path: string, init: RequestInit | undefined, transport: 'public' | 'admin') {
  if (API_CONFIG_ERROR) {
    throw new ApiError(API_CONFIG_ERROR, 'api_not_configured')
  }

  let response: Response
  const controller = typeof AbortController === 'undefined' ? null : new AbortController()
  const timeout = controller
    ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    : null

  const adminRequest = transport === 'admin'
  const headers = new Headers(init?.headers)
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (sessionToken) {
    headers.set('Authorization', 'Bearer ' + sessionToken)
  }
  if (adminRequest && adminToken) {
    headers.set('X-Admin-Token', adminToken)
  }

  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      credentials: adminRequest ? 'include' : 'omit',
      signal: controller?.signal,
      headers,
    })
  } catch (fetchError) {
    const { code, message } = classifyFetchFailure(fetchError)
    // Safe diagnostics: URL + method only. Never log initData, tokens or bodies.
    console.error('[api] request failed before response', {
      url: `${API_URL}${path}`,
      method: init?.method ?? 'GET',
      reason: code,
      ...getApiDiagnostics(),
    })
    throw new ApiError(message, code)
  } finally {
    if (timeout) {
      clearTimeout(timeout)
    }
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed', code: 'request_failed' })) as { message?: string; code?: string }
    let code = error.code ?? FALLBACK_CODE_BY_STATUS[response.status] ?? 'request_failed'

    if (response.status === 401) {
      if (!error.code) {
        code = adminRequest ? 'invalid_admin_session' : 'invalid_session_token'
      } else if (adminRequest && path !== '/admin/auth/login' && error.code === 'unauthorized') {
        code = 'invalid_admin_session'
      }
    }

    if (response.status >= 500 || response.status === 403) {
      console.error('[api] request rejected', {
        url: `${API_URL}${path}`,
        method: init?.method ?? 'GET',
        status: response.status,
        code,
      })
    }

    throw new ApiError(error.message ?? 'Request failed', code, response.status)
  }

  return (await response.json()) as T
}

export const publicApiClient = {
  request<T>(path: string, init?: RequestInit) {
    return request<T>(path, init, 'public')
  },
}

export const adminApiClient = {
  request<T>(path: string, init?: RequestInit) {
    return request<T>(path, init, 'admin')
  },
}

export const api = {
  setSessionToken(token: string | null) {
    sessionToken = token
  },
  setAdminToken(token: string | null) {
    adminToken = token
  },
  bootstrap(payload: { initData: string }) {
    return publicApiClient.request<BootstrapResponse>('/session/bootstrap', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  getCatalog(params: { cityId: number; search?: string; categoryId?: number | 'all' }) {
    const searchParams = new URLSearchParams({ cityId: String(params.cityId) })
    if (params.search) searchParams.set('search', params.search)
    if (params.categoryId && params.categoryId !== 'all') searchParams.set('categoryId', String(params.categoryId))
    return publicApiClient.request<{ products: ProductSummary[] }>(`/catalog?${searchParams.toString()}`)
  },
  getCities() {
    return publicApiClient.request<City[]>('/cities')
  },
  getProduct(productId: number, cityId: number) {
    return publicApiClient.request<{ product: ProductDetail }>(`/products/${productId}?cityId=${cityId}`)
  },
  getCart() {
    return publicApiClient.request<{ cart: Cart; recommended: ProductSummary[] }>('/cart')
  },
  updateCity(cityId: number) {
    return publicApiClient.request<{ user: UserProfile }>('/users/city', { method: 'PATCH', body: JSON.stringify({ cityId }) })
  },
  updateLanguage(language: Language) {
    return publicApiClient.request<{ user: UserProfile }>('/users/language', { method: 'PATCH', body: JSON.stringify({ language }) })
  },
  addCartItem(payload: { productCityId: number; quantity: number }) {
    return publicApiClient.request<{ cart: Cart; recommended: ProductSummary[] }>('/cart/items', { method: 'POST', body: JSON.stringify(payload) })
  },
  updateCartItem(itemId: number, payload: { quantity: number }) {
    return publicApiClient.request<{ cart: Cart; recommended: ProductSummary[] }>(`/cart/items/${itemId}`, { method: 'PATCH', body: JSON.stringify(payload) })
  },
  removeCartItem(itemId: number) {
    return publicApiClient.request<{ cart: Cart; recommended: ProductSummary[] }>(`/cart/items/${itemId}`, { method: 'DELETE' })
  },
  checkout(payload?: { comment?: string; discountCode?: string; deliveryOptionId?: number }) {
    return publicApiClient.request<{ order: Order; cart: Cart; recommended: ProductSummary[] }>('/orders', { method: 'POST', body: JSON.stringify(payload ?? {}) })
  },
  getOrders() {
    return publicApiClient.request<{ orders: Order[] }>('/orders')
  },
  getOrder(id: number) {
    return publicApiClient.request<{ order: Order }>(`/orders/${id}`)
  },
  cancelOrder(id: number) {
    return publicApiClient.request<{ order: Order }>(`/orders/${id}/cancel`, { method: 'POST' })
  },
  requestRefund(id: number) {
    return publicApiClient.request<{ order: Order }>(`/orders/${id}/refund-request`, { method: 'POST' })
  },

  // Profile
  getProfile() {
    return publicApiClient.request<{ user: UserProfile }>('/users/me')
  },

  // Balance
  getBalance() {
    return publicApiClient.request<{ balance: Balance }>('/balance')
  },
  topupBalance(amount: number) {
    return publicApiClient.request<{ balance: Balance }>('/balance/topup', { method: 'POST', body: JSON.stringify({ amount }) })
  },

  // Casino
  casinoSpin(bet: number, target: number) {
    return publicApiClient.request<{ dice: number; target: number; win: boolean; bet: number; payout: number; balance: { amount: number } }>('/casino/spin', { method: 'POST', body: JSON.stringify({ bet, target }) })
  },
  getCasinoHistory() {
    return publicApiClient.request<{ history: { id: number; type: string; amount: number; comment: string | null; createdAt: string }[] }>('/casino/history')
  },

  // Support
  getSupportTickets() {
    return publicApiClient.request<{ tickets: SupportTicket[] }>('/support')
  },
  createSupportTicket(subject: string, message: string) {
    return publicApiClient.request<{ ticket: SupportTicket }>('/support', { method: 'POST', body: JSON.stringify({ subject, message }) })
  },
  replySupportTicket(ticketId: number, message: string) {
    return publicApiClient.request<{ ticket: SupportTicket }>(`/support/${ticketId}/reply`, { method: 'POST', body: JSON.stringify({ message }) })
  },

  // Discounts
  validateDiscount(code: string, orderAmount: number) {
    return publicApiClient.request<{ discount: Discount; discountAmount: number }>('/discounts/validate', { method: 'POST', body: JSON.stringify({ code, orderAmount }) })
  },

  // Reviews
  getReviews(productId: number) {
    return publicApiClient.request<{ reviews: Review[]; avgRating: number | null; count: number }>(`/reviews?productId=${productId}`)
  },
  submitReview(productId: number, rating: number, comment?: string) {
    return publicApiClient.request<{ review: Review }>('/reviews', { method: 'POST', body: JSON.stringify({ productId, rating, comment }) })
  },
  deleteReview(productId: number) {
    return publicApiClient.request<{ ok: boolean }>(`/reviews/${productId}`, { method: 'DELETE' })
  },

  // Wishlist
  getWishlist() {
    return publicApiClient.request<{ items: WishlistItem[] }>('/wishlist')
  },
  addToWishlist(productCityId: number) {
    return publicApiClient.request<{ item: WishlistItem }>('/wishlist', { method: 'POST', body: JSON.stringify({ productCityId }) })
  },
  removeFromWishlist(productCityId: number) {
    return publicApiClient.request<{ ok: boolean }>(`/wishlist/${productCityId}`, { method: 'DELETE' })
  },

  // Delivery
  getDeliveryOptions() {
    return publicApiClient.request<{ options: { id: number; name: string; nameEn: string | null; type: string; price: number }[] }>('/delivery')
  },


  // Admin auth/settings
  adminLogin(data: { password: string }) {
    return adminApiClient.request<{ adminToken: string; expiresAt: string; settings: AdminSettingsResponse }>('/admin/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },
  adminLogout() {
    return adminApiClient.request<{ ok: boolean }>('/admin/auth/logout', { method: 'POST' })
  },
  getAdminSettings() {
    return adminApiClient.request<AdminSettingsResponse>('/admin/settings')
  },
  updateAdminPassword(data: { currentPassword: string; newPassword: string }) {
    return adminApiClient.request<{ saved: boolean; adminToken: string; expiresAt: string }>('/admin/settings/password', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },
  addAdministrator(telegramId: string) {
    return adminApiClient.request<{ administrators: string[] }>('/admin/settings/administrators', {
      method: 'POST',
      body: JSON.stringify({ telegramId }),
    })
  },
  changeAdministrator(currentTelegramId: string, telegramId: string) {
    return adminApiClient.request<{ administrators: string[] }>(`/admin/settings/administrators/${currentTelegramId}`, {
      method: 'PATCH',
      body: JSON.stringify({ telegramId }),
    })
  },
  removeAdministrator(telegramId: string) {
    return adminApiClient.request<{ administrators: string[] }>(`/admin/settings/administrators/${telegramId}`, {
      method: 'DELETE',
    })
  },

  // Admin
  getAdminStats() {
    return adminApiClient.request<AdminStats>('/admin/stats')
  },
  getAdminOrders(page = 1, status?: string) {
    const params = new URLSearchParams({ page: String(page) })
    if (status) params.set('status', status)
    return adminApiClient.request<{ orders: Order[]; total: number; page: number; pages: number }>(`/admin/orders?${params}`)
  },
  updateAdminOrderStatus(orderId: number, status: string, comment?: string) {
    return adminApiClient.request<{ order: Order }>(`/admin/orders/${orderId}/status`, { method: 'PATCH', body: JSON.stringify({ status, comment }) })
  },
  processRefund(orderId: number, refundStatus: 'approved' | 'rejected') {
    return adminApiClient.request<{ order: Order }>(`/admin/orders/${orderId}/refund`, { method: 'PATCH', body: JSON.stringify({ refundStatus }) })
  },
  getAdminUsers(page = 1) {
    return adminApiClient.request<{ users: UserProfile[]; total: number; page: number; pages: number }>(`/admin/users?page=${page}`)
  },
  getAdminProducts() {
    return adminApiClient.request<{ products: AdminProduct[] }>('/admin/products')
  },
  updateAdminProduct(id: number, data: Partial<{ name: string; nameEn: string; description: string; descriptionEn: string; price: number; image: string; isActive: boolean; isRecommended: boolean }>) {
    return adminApiClient.request<{ product: AdminProduct }>(`/admin/products/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  },
  updateProductCity(id: number, data: Partial<{ stock: number; isAvailable: boolean }>) {
    return adminApiClient.request<{ productCity: unknown }>(`/admin/product-cities/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  },
  getAdminDiscounts() {
    return adminApiClient.request<{ discounts: Discount[] }>('/admin/discounts')
  },
  createAdminDiscount(data: { code: string; type: string; value: number; minOrderAmount?: number; usageLimit?: number }) {
    return adminApiClient.request<{ discount: Discount }>('/admin/discounts', { method: 'POST', body: JSON.stringify(data) })
  },
  getAdminSupportTickets(status?: string) {
    const params = status ? `?status=${status}` : ''
    return adminApiClient.request<{ tickets: SupportTicket[] }>(`/admin/support${params}`)
  },
  adminReplySupportTicket(ticketId: number, message: string) {
    return adminApiClient.request<{ ticket: SupportTicket }>(`/admin/support/${ticketId}/reply`, { method: 'POST', body: JSON.stringify({ message }) })
  },
  getAuditLogs(page = 1) {
    return adminApiClient.request<{ logs: { id: number; action: string; entity: string | null; entityId: number | null; meta: string | null; createdAt: string }[] }>(`/admin/audit-logs?page=${page}`)
  },

  // Admin – Bot configuration
  getAdminBot() {
    return adminApiClient.request<BotStatusResponse>('/admin/bot')
  },
  connectAdminBot(token: string) {
    return adminApiClient.request<BotStatusResponse>('/admin/bot/connect', {
      method: 'POST',
      body: JSON.stringify({ token }),
    })
  },
  testAdminBot() {
    return adminApiClient.request<BotStatusResponse>('/admin/bot/test', { method: 'POST' })
  },
  changeAdminBot(token: string) {
    return adminApiClient.request<BotStatusResponse>('/admin/bot/change', {
      method: 'POST',
      body: JSON.stringify({ token }),
    })
  },
  disconnectAdminBot() {
    return adminApiClient.request<BotStatusResponse>('/admin/bot/disconnect', { method: 'POST' })
  },

  // Admin – Cities
  getAdminCities() {
    return adminApiClient.request<{ cities: AdminCity[] }>('/admin/cities')
  },
  createAdminCity(data: { name: string; nameEn?: string; sortOrder?: number; isActive?: boolean }) {
    return adminApiClient.request<{ city: AdminCity }>('/admin/cities', { method: 'POST', body: JSON.stringify(data) })
  },
  updateAdminCity(id: number, data: Partial<{ name: string; nameEn: string; isActive: boolean; sortOrder: number }>) {
    return adminApiClient.request<{ city: AdminCity }>(`/admin/cities/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  },
  deleteAdminCity(id: number) {
    return adminApiClient.request<{ ok?: boolean; city?: AdminCity; deactivated?: boolean }>(`/admin/cities/${id}`, { method: 'DELETE' })
  },

  // Admin – Categories
  getAdminCategories() {
    return adminApiClient.request<{ categories: AdminCategory[] }>('/admin/categories')
  },
  createAdminCategory(data: { name: string; nameEn?: string; sortOrder?: number }) {
    return adminApiClient.request<{ category: AdminCategory }>('/admin/categories', { method: 'POST', body: JSON.stringify(data) })
  },
  updateAdminCategory(id: number, data: Partial<{ name: string; nameEn: string; isActive: boolean; sortOrder: number }>) {
    return adminApiClient.request<{ category: AdminCategory }>(`/admin/categories/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  },
  deleteAdminCategory(id: number) {
    return adminApiClient.request<{ ok?: boolean; category?: AdminCategory; deactivated?: boolean }>(`/admin/categories/${id}`, { method: 'DELETE' })
  },

  // Admin – Products (create / delete)
  createAdminProduct(data: { name: string; nameEn?: string; description: string; descriptionEn?: string; price: number; categoryId: number; image?: string; isActive?: boolean; isRecommended?: boolean }) {
    return adminApiClient.request<{ product: AdminProduct }>('/admin/products', { method: 'POST', body: JSON.stringify(data) })
  },
  deleteAdminProduct(id: number) {
    return adminApiClient.request<{ ok?: boolean; product?: AdminProduct; deactivated?: boolean }>(`/admin/products/${id}`, { method: 'DELETE' })
  },
}
