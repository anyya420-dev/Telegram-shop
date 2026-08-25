import type {
  AdminStats,
  Balance,
  BootstrapResponse,
  Cart,
  Category,
  City,
  Discount,
  Language,
  Order,
  PaymentMethod,
  ProductDetail,
  ProductSummary,
  Review,
  SupportTicket,
  TelegramIdentity,
  UserProfile,
  WishlistItem,
} from '../types'

export function resolveApiUrl(env = (import.meta as { env?: Record<string, string> }).env) {
  const configuredValue = env?.VITE_API_URL?.trim() ?? ''

  if (!configuredValue) {
    return ''
  }

  const normalizedValue = configuredValue.replace(/\/+$/, '')
  return normalizedValue.endsWith('/api') ? normalizedValue : `${normalizedValue}/api`
}

const API_URL = resolveApiUrl()
let sessionToken: string | null = null

export class ApiError extends Error {
  code?: string

  constructor(message: string, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

function createApiClient(defaults: { credentials: RequestCredentials; includeSessionToken: boolean }) {
  return async function request<T>(
    path: string,
    init: RequestInit | undefined = undefined,
    overrides?: Partial<{ credentials: RequestCredentials; includeSessionToken: boolean }>,
  ) {
    const options = {
      credentials: overrides?.credentials ?? defaults.credentials,
      includeSessionToken: overrides?.includeSessionToken ?? defaults.includeSessionToken,
    }

    const headers = new Headers(init?.headers)
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }
    if (options.includeSessionToken && sessionToken) {
      headers.set('Authorization', 'Bearer' + ' ' + sessionToken)
    }

    let response: Response
    try {
      response = await fetch(`${API_URL}${path}`, {
        ...init,
        credentials: options.credentials,
        headers,
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
}

const publicRequest = createApiClient({ credentials: 'omit', includeSessionToken: true })
const adminRequest = createApiClient({ credentials: 'include', includeSessionToken: false })

export const api = {
  setSessionToken(token: string | null) {
    sessionToken = token
  },
  bootstrap(payload: { initData: string; telegramUser: TelegramIdentity; isTelegramEnvironment: boolean }) {
    return publicRequest<BootstrapResponse>('/session/bootstrap', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, { includeSessionToken: false })
  },
  getCatalog(params: { cityId: number; search?: string; categoryId?: number | 'all'; sort?: 'newest' | 'price_asc' | 'price_desc' | 'popular' }) {
    const searchParams = new URLSearchParams({ cityId: String(params.cityId) })
    if (params.search) searchParams.set('search', params.search)
    if (params.categoryId && params.categoryId !== 'all') searchParams.set('categoryId', String(params.categoryId))
    if (params.sort) searchParams.set('sort', params.sort)
    return publicRequest<{ products: ProductSummary[] }>(`/catalog?${searchParams.toString()}`)
  },
  getCities() {
    return publicRequest<City[]>('/cities', undefined, { includeSessionToken: false })
  },
  getProduct(productId: number, cityId: number) {
    return publicRequest<{ product: ProductDetail }>(`/products/${productId}?cityId=${cityId}`, undefined, { includeSessionToken: false })
  },
  getCart() {
    return publicRequest<{ cart: Cart; recommended: ProductSummary[] }>('/cart')
  },
  updateCity(cityId: number) {
    return publicRequest<{ user: UserProfile }>('/users/city', { method: 'PATCH', body: JSON.stringify({ cityId }) })
  },
  updateLanguage(language: Language) {
    return publicRequest<{ user: UserProfile }>('/users/language', { method: 'PATCH', body: JSON.stringify({ language }) })
  },
  addCartItem(payload: { productCityId: number; quantity: number }) {
    return publicRequest<{ cart: Cart; recommended: ProductSummary[] }>('/cart/items', { method: 'POST', body: JSON.stringify(payload) })
  },
  updateCartItem(itemId: number, payload: { quantity: number }) {
    return publicRequest<{ cart: Cart; recommended: ProductSummary[] }>(`/cart/items/${itemId}`, { method: 'PATCH', body: JSON.stringify(payload) })
  },
  removeCartItem(itemId: number) {
    return publicRequest<{ cart: Cart; recommended: ProductSummary[] }>(`/cart/items/${itemId}`, { method: 'DELETE' })
  },
  checkout(payload?: { comment?: string; discountCode?: string; deliveryOptionId?: number; paymentMethodId?: number }) {
    return publicRequest<{ order: Order; cart: Cart; recommended: ProductSummary[] }>('/orders', { method: 'POST', body: JSON.stringify(payload ?? {}) })
  },
  markOrderPaid(id: number) {
    return publicRequest<{ order: Order }>(`/orders/${id}/mark-paid`, { method: 'POST' })
  },
  getOrders() {
    return publicRequest<{ orders: Order[] }>('/orders')
  },
  getOrder(id: number) {
    return publicRequest<{ order: Order }>(`/orders/${id}`)
  },
  cancelOrder(id: number) {
    return publicRequest<{ order: Order }>(`/orders/${id}/cancel`, { method: 'POST' })
  },
  requestRefund(id: number) {
    return publicRequest<{ order: Order }>(`/orders/${id}/refund-request`, { method: 'POST' })
  },

  getProfile() {
    return publicRequest<{ user: UserProfile }>('/users/me')
  },

  getBalance() {
    return publicRequest<{ balance: Balance }>('/balance')
  },
  topupBalance(amount: number) {
    return publicRequest<{ balance: Balance }>('/balance/topup', { method: 'POST', body: JSON.stringify({ amount }) })
  },

  casinoSpin(bet: number, target: number) {
    return publicRequest<{ dice: number; target: number; win: boolean; bet: number; payout: number; balance: { amount: number } }>('/casino/spin', { method: 'POST', body: JSON.stringify({ bet, target }) })
  },
  getCasinoHistory() {
    return publicRequest<{ history: { id: number; type: string; amount: number; comment: string | null; createdAt: string }[] }>('/casino/history')
  },

  getSupportTickets() {
    return publicRequest<{ tickets: SupportTicket[] }>('/support')
  },
  createSupportTicket(subject: string, message: string) {
    return publicRequest<{ ticket: SupportTicket }>('/support', { method: 'POST', body: JSON.stringify({ subject, message }) })
  },
  replySupportTicket(ticketId: number, message: string) {
    return publicRequest<{ ticket: SupportTicket }>(`/support/${ticketId}/reply`, { method: 'POST', body: JSON.stringify({ message }) })
  },

  validateDiscount(code: string, orderAmount: number) {
    return publicRequest<{ discount: Discount; discountAmount: number }>('/discounts/validate', { method: 'POST', body: JSON.stringify({ code, orderAmount }) })
  },

  getReviews(productId: number) {
    return publicRequest<{ reviews: Review[]; avgRating: number | null; count: number }>(`/reviews?productId=${productId}`)
  },
  submitReview(productId: number, rating: number, comment?: string) {
    return publicRequest<{ review: Review }>('/reviews', { method: 'POST', body: JSON.stringify({ productId, rating, comment }) })
  },
  deleteReview(productId: number) {
    return publicRequest<{ ok: boolean }>(`/reviews/${productId}`, { method: 'DELETE' })
  },

  getWishlist() {
    return publicRequest<{ items: WishlistItem[] }>('/wishlist')
  },
  addToWishlist(productCityId: number) {
    return publicRequest<{ item: WishlistItem }>('/wishlist', { method: 'POST', body: JSON.stringify({ productCityId }) })
  },
  removeFromWishlist(productCityId: number) {
    return publicRequest<{ ok: boolean }>(`/wishlist/${productCityId}`, { method: 'DELETE' })
  },

  getDeliveryOptions() {
    return publicRequest<{ options: { id: number; name: string; nameEn: string | null; type: string; price: number }[] }>('/delivery')
  },
  getPaymentMethods() {
    return publicRequest<{ methods: PaymentMethod[] }>('/payments/methods')
  },

  adminLogin(data: { password: string }) {
    return adminRequest<{ ok: boolean }>('/admin/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },
  adminLogout() {
    return adminRequest<{ ok: boolean }>('/admin/auth/logout', { method: 'POST' })
  },
  adminStatus() {
    return adminRequest<{ authenticated: boolean }>('/admin/auth/status')
  },
  getAdminStats() {
    return adminRequest<AdminStats>('/admin/stats')
  },
  getAdminOrders(page = 1, status?: string) {
    const params = new URLSearchParams({ page: String(page) })
    if (status) params.set('status', status)
    return adminRequest<{ orders: Order[]; total: number; page: number; pages: number }>(`/admin/orders?${params}`)
  },
  updateAdminOrderStatus(orderId: number, status: string, comment?: string) {
    return adminRequest<{ order: Order }>(`/admin/orders/${orderId}/status`, { method: 'PATCH', body: JSON.stringify({ status, comment }) })
  },
  processRefund(orderId: number, refundStatus: 'approved' | 'rejected') {
    return adminRequest<{ order: Order }>(`/admin/orders/${orderId}/refund`, { method: 'PATCH', body: JSON.stringify({ refundStatus }) })
  },
  confirmAdminOrderPayment(orderId: number) {
    return adminRequest<{ order: Order }>(`/admin/orders/${orderId}/payment`, { method: 'PATCH', body: JSON.stringify({ action: 'confirm' }) })
  },
  rejectAdminOrderPayment(orderId: number) {
    return adminRequest<{ order: Order }>(`/admin/orders/${orderId}/payment`, { method: 'PATCH', body: JSON.stringify({ action: 'reject' }) })
  },
  getAdminUsers(page = 1) {
    return adminRequest<{ users: UserProfile[]; total: number; page: number; pages: number }>(`/admin/users?page=${page}`)
  },
  getAdminProducts() {
    return adminRequest<{ products: ProductDetail[] }>('/admin/products')
  },
  createAdminProduct(data: { name: string; nameEn?: string; description?: string; price: number; categoryId: number; image?: string; isActive?: boolean; isRecommended?: boolean; cities?: { cityId: number; stock: number; isAvailable: boolean }[] }) {
    return adminRequest<{ product: unknown }>('/admin/products', { method: 'POST', body: JSON.stringify(data) })
  },
  createAdminProductCity(data: { productId: number; cityId: number; stock?: number; isAvailable?: boolean }) {
    return adminRequest<{ productCity: unknown }>('/admin/product-cities', { method: 'POST', body: JSON.stringify(data) })
  },
  updateAdminProduct(id: number, data: Partial<{ name: string; price: number; isActive: boolean; isRecommended: boolean }>) {
    return adminRequest<{ product: ProductDetail }>(`/admin/products/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  },
  updateProductCity(id: number, data: Partial<{ stock: number; isAvailable: boolean }>) {
    return adminRequest<{ productCity: unknown }>(`/admin/product-cities/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  },
  getAdminDiscounts() {
    return adminRequest<{ discounts: Discount[] }>('/admin/discounts')
  },
  createAdminDiscount(data: { code: string; type: string; value: number; minOrderAmount?: number; usageLimit?: number }) {
    return adminRequest<{ discount: Discount }>('/admin/discounts', { method: 'POST', body: JSON.stringify(data) })
  },
  getAdminSupportTickets(status?: string) {
    const params = status ? `?status=${status}` : ''
    return adminRequest<{ tickets: SupportTicket[] }>(`/admin/support${params}`)
  },
  adminReplySupportTicket(ticketId: number, message: string) {
    return adminRequest<{ ticket: SupportTicket }>(`/admin/support/${ticketId}/reply`, { method: 'POST', body: JSON.stringify({ message }) })
  },
  getAuditLogs(page = 1) {
    return adminRequest<{ logs: { id: number; action: string; entity: string | null; entityId: number | null; meta: string | null; createdAt: string }[] }>(`/admin/audit-logs?page=${page}`)
  },
  getAdminPaymentSettings() {
    return adminRequest<{ methods: PaymentMethod[] }>('/admin/payment-settings')
  },
  createAdminPaymentSetting(data: Partial<PaymentMethod> & { type: PaymentMethod['type']; title: string }) {
    return adminRequest<{ method: PaymentMethod }>('/admin/payment-settings', { method: 'POST', body: JSON.stringify(data) })
  },
  updateAdminPaymentSetting(id: number, data: Partial<PaymentMethod>) {
    return adminRequest<{ method: PaymentMethod }>(`/admin/payment-settings/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  },
  deleteAdminPaymentSetting(id: number) {
    return adminRequest<{ ok: boolean }>(`/admin/payment-settings/${id}`, { method: 'DELETE' })
  },
  toggleAdminPaymentSetting(id: number) {
    return adminRequest<{ method: PaymentMethod }>(`/admin/payment-settings/${id}/toggle`, { method: 'PATCH' })
  },
  getAdminCategories() {
    return adminRequest<{ categories: (Category & { _count: { products: number } })[] }>('/admin/categories')
  },
  createAdminCategory(data: { name: string; nameEn?: string; sortOrder?: number }) {
    return adminRequest<{ category: Category & { _count: { products: number } } }>('/admin/categories', { method: 'POST', body: JSON.stringify(data) })
  },
  updateAdminCategory(id: number, data: { name?: string; nameEn?: string; isActive?: boolean; sortOrder?: number }) {
    return adminRequest<{ category: Category & { _count: { products: number } } }>(`/admin/categories/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  },
}
