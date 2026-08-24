import type {
  AdminStats,
  Balance,
  BootstrapResponse,
  Cart,
  City,
  Discount,
  Language,
  Order,
  ProductDetail,
  ProductSummary,
  Review,
  SupportTicket,
  TelegramIdentity,
  UserProfile,
  WishlistItem,
} from '../types'

// In production VITE_API_URL is baked in by Vite at build time (set in render.yaml).
// In local dev without the env var, fall back to '' so Vite's proxy forwards /api/* to localhost:3001.
const API_URL: string = import.meta.env.VITE_API_URL ?? ''
let sessionToken: string | null = null

export class ApiError extends Error {
  code?: string

  constructor(message: string, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

async function request<T>(path: string, init?: RequestInit) {
  let response: Response

  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(sessionToken ? { Authorization: 'Bearer ' + sessionToken } : {}),
        ...(init?.headers ?? {}),
      },
    })
  } catch {
    throw new ApiError('Network error', 'network_error')
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed', code: 'request_failed' })) as { message?: string; code?: string }
    throw new ApiError(error.message ?? 'Request failed', error.code ?? 'request_failed')
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
    if (params.search) searchParams.set('search', params.search)
    if (params.categoryId && params.categoryId !== 'all') searchParams.set('categoryId', String(params.categoryId))
    return request<{ products: ProductSummary[] }>(`/catalog?${searchParams.toString()}`)
  },
  getCities() {
    return request<City[]>('/cities')
  },
  getProduct(productId: number, cityId: number) {
    return request<{ product: ProductDetail }>(`/products/${productId}?cityId=${cityId}`)
  },
  getCart() {
    return request<{ cart: Cart; recommended: ProductSummary[] }>('/cart')
  },
  updateCity(cityId: number) {
    return request<{ user: UserProfile }>('/users/city', { method: 'PATCH', body: JSON.stringify({ cityId }) })
  },
  updateLanguage(language: Language) {
    return request<{ user: UserProfile }>('/users/language', { method: 'PATCH', body: JSON.stringify({ language }) })
  },
  addCartItem(payload: { productCityId: number; quantity: number }) {
    return request<{ cart: Cart; recommended: ProductSummary[] }>('/cart/items', { method: 'POST', body: JSON.stringify(payload) })
  },
  updateCartItem(itemId: number, payload: { quantity: number }) {
    return request<{ cart: Cart; recommended: ProductSummary[] }>(`/cart/items/${itemId}`, { method: 'PATCH', body: JSON.stringify(payload) })
  },
  removeCartItem(itemId: number) {
    return request<{ cart: Cart; recommended: ProductSummary[] }>(`/cart/items/${itemId}`, { method: 'DELETE' })
  },
  checkout(payload?: { comment?: string; discountCode?: string; deliveryOptionId?: number }) {
    return request<{ order: Order; cart: Cart; recommended: ProductSummary[] }>('/orders', { method: 'POST', body: JSON.stringify(payload ?? {}) })
  },
  getOrders() {
    return request<{ orders: Order[] }>('/orders')
  },
  getOrder(id: number) {
    return request<{ order: Order }>(`/orders/${id}`)
  },
  cancelOrder(id: number) {
    return request<{ order: Order }>(`/orders/${id}/cancel`, { method: 'POST' })
  },
  requestRefund(id: number) {
    return request<{ order: Order }>(`/orders/${id}/refund-request`, { method: 'POST' })
  },

  // Profile
  getProfile() {
    return request<{ user: UserProfile }>('/users/me')
  },

  // Balance
  getBalance() {
    return request<{ balance: Balance }>('/balance')
  },
  topupBalance(amount: number) {
    return request<{ balance: Balance }>('/balance/topup', { method: 'POST', body: JSON.stringify({ amount }) })
  },

  // Casino
  casinoSpin(bet: number, target: number) {
    return request<{ dice: number; target: number; win: boolean; bet: number; payout: number; balance: { amount: number } }>('/casino/spin', { method: 'POST', body: JSON.stringify({ bet, target }) })
  },
  getCasinoHistory() {
    return request<{ history: { id: number; type: string; amount: number; comment: string | null; createdAt: string }[] }>('/casino/history')
  },

  // Support
  getSupportTickets() {
    return request<{ tickets: SupportTicket[] }>('/support')
  },
  createSupportTicket(subject: string, message: string) {
    return request<{ ticket: SupportTicket }>('/support', { method: 'POST', body: JSON.stringify({ subject, message }) })
  },
  replySupportTicket(ticketId: number, message: string) {
    return request<{ ticket: SupportTicket }>(`/support/${ticketId}/reply`, { method: 'POST', body: JSON.stringify({ message }) })
  },

  // Discounts
  validateDiscount(code: string, orderAmount: number) {
    return request<{ discount: Discount; discountAmount: number }>('/discounts/validate', { method: 'POST', body: JSON.stringify({ code, orderAmount }) })
  },

  // Reviews
  getReviews(productId: number) {
    return request<{ reviews: Review[]; avgRating: number | null; count: number }>(`/reviews?productId=${productId}`)
  },
  submitReview(productId: number, rating: number, comment?: string) {
    return request<{ review: Review }>('/reviews', { method: 'POST', body: JSON.stringify({ productId, rating, comment }) })
  },
  deleteReview(productId: number) {
    return request<{ ok: boolean }>(`/reviews/${productId}`, { method: 'DELETE' })
  },

  // Wishlist
  getWishlist() {
    return request<{ items: WishlistItem[] }>('/wishlist')
  },
  addToWishlist(productCityId: number) {
    return request<{ item: WishlistItem }>('/wishlist', { method: 'POST', body: JSON.stringify({ productCityId }) })
  },
  removeFromWishlist(productCityId: number) {
    return request<{ ok: boolean }>(`/wishlist/${productCityId}`, { method: 'DELETE' })
  },

  // Delivery
  getDeliveryOptions() {
    return request<{ options: { id: number; name: string; nameEn: string | null; type: string; price: number }[] }>('/delivery')
  },

  // Admin
  getAdminStats() {
    return request<AdminStats>('/admin/stats')
  },
  getAdminOrders(page = 1, status?: string) {
    const params = new URLSearchParams({ page: String(page) })
    if (status) params.set('status', status)
    return request<{ orders: Order[]; total: number; page: number; pages: number }>(`/admin/orders?${params}`)
  },
  updateAdminOrderStatus(orderId: number, status: string, comment?: string) {
    return request<{ order: Order }>(`/admin/orders/${orderId}/status`, { method: 'PATCH', body: JSON.stringify({ status, comment }) })
  },
  processRefund(orderId: number, refundStatus: 'approved' | 'rejected') {
    return request<{ order: Order }>(`/admin/orders/${orderId}/refund`, { method: 'PATCH', body: JSON.stringify({ refundStatus }) })
  },
  getAdminUsers(page = 1) {
    return request<{ users: UserProfile[]; total: number; page: number; pages: number }>(`/admin/users?page=${page}`)
  },
  getAdminProducts() {
    return request<{ products: ProductDetail[] }>('/admin/products')
  },
  updateAdminProduct(id: number, data: Partial<{ name: string; price: number; isActive: boolean; isRecommended: boolean }>) {
    return request<{ product: ProductDetail }>(`/admin/products/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  },
  updateProductCity(id: number, data: Partial<{ stock: number; isAvailable: boolean }>) {
    return request<{ productCity: unknown }>(`/admin/product-cities/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  },
  getAdminDiscounts() {
    return request<{ discounts: Discount[] }>('/admin/discounts')
  },
  createAdminDiscount(data: { code: string; type: string; value: number; minOrderAmount?: number; usageLimit?: number }) {
    return request<{ discount: Discount }>('/admin/discounts', { method: 'POST', body: JSON.stringify(data) })
  },
  getAdminSupportTickets(status?: string) {
    const params = status ? `?status=${status}` : ''
    return request<{ tickets: SupportTicket[] }>(`/admin/support${params}`)
  },
  adminReplySupportTicket(ticketId: number, message: string) {
    return request<{ ticket: SupportTicket }>(`/admin/support/${ticketId}/reply`, { method: 'POST', body: JSON.stringify({ message }) })
  },
  getAuditLogs(page = 1) {
    return request<{ logs: { id: number; action: string; entity: string | null; entityId: number | null; meta: string | null; createdAt: string }[] }>(`/admin/audit-logs?page=${page}`)
  },
}
