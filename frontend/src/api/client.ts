import type {
  AdminCategory,
  AdminCasinoConfig,
  AdminCity,
  AdminDeliveryOption,
  AdminOrder,
  AdminProduct,
  AdminStats,
  Balance,
  CasinoState,
  BootstrapResponse,
  Cart,
  Category,
  City,
  DeliveryOption,
  Discount,
  Language,
  Order,
  Payment,
  PaymentMethod,
  ProductDetail,
  ProductSummary,
  Review,
  SupportTicket,
  TelegramIdentity,
  UserProfile,
  WishlistItem,
  AdminPaymentRecord,
  Administrator,
  AdminPickupStorage,
  DepositRequest,
  DepositWallet,
  AdminDepositRequest,
} from '../types'

function normalizeApiBase(value: string) {
  const preparedValue = value.startsWith('http://') || value.startsWith('https://') || value.startsWith('/')
    ? value
    : `https://${value}`
  const normalizedValue = preparedValue.replace(/\/+$/, '')
  return normalizedValue.endsWith('/api') ? normalizedValue : `${normalizedValue}/api`
}

export function resolveApiUrl(env = (import.meta as { env?: Record<string, string | boolean> }).env) {
  const configuredValue = typeof env?.VITE_API_URL === 'string' ? env.VITE_API_URL.trim() : ''
  const defaultProductionApiUrl = (typeof env?.VITE_DEFAULT_API_URL === 'string' && env.VITE_DEFAULT_API_URL.trim())
    || 'https://narcos-shop.onrender.com/api'
  const isProduction = env?.PROD === true || env?.PROD === 'true' || env?.MODE === 'production'

  if (!configuredValue) {
    return isProduction ? normalizeApiBase(defaultProductionApiUrl) : '/api'
  }

  return normalizeApiBase(configuredValue)
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
  bootstrap(payload: { initData: string; telegramUser?: TelegramIdentity; isTelegramEnvironment: boolean }) {
    return publicRequest<BootstrapResponse>('/session/bootstrap', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, { includeSessionToken: false })
  },
  getCatalog(params: { cityId?: number; search?: string; categoryId?: number | 'all'; sort?: 'newest' | 'price_asc' | 'price_desc' | 'popular' }) {
    const searchParams = new URLSearchParams()
    if (params.cityId) searchParams.set('cityId', String(params.cityId))
    if (params.search) searchParams.set('search', params.search)
    if (params.categoryId && params.categoryId !== 'all') searchParams.set('categoryId', String(params.categoryId))
    if (params.sort) searchParams.set('sort', params.sort)
    return publicRequest<{ products: ProductSummary[] }>(`/catalog?${searchParams.toString()}`)
  },
  getCities() {
    return publicRequest<City[]>('/cities', undefined, { includeSessionToken: false })
  },
  getProduct(productId: number, cityId?: number) {
    const query = cityId ? `?cityId=${cityId}` : ''
    return publicRequest<{ product: ProductDetail }>(`/products/${productId}${query}`, undefined, { includeSessionToken: false })
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
  checkout(payload: { comment?: string; discountCode?: string; deliveryOptionId?: number; paymentMethodId?: number; rewardId?: number; casinoCreditsToUse?: number }) {
    return publicRequest<{ order: Order; cart: Cart; recommended: ProductSummary[] }>('/orders', { method: 'POST', body: JSON.stringify(payload) })
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
  getCasinoState() {
    return publicRequest<CasinoState>('/casino')
  },

  playCasinoGame(game: 'wheel' | 'slots' | 'roulette' | 'chest', payload: Record<string, unknown>) {
    return publicRequest<{ round: CasinoState['history'][number]; reward: { rewardType: string; discountPercent: number | null; creditAmount: number | null; title: string }; balance: CasinoState['balance'] }>(`/casino/${game}/play`, { method: 'POST', body: JSON.stringify(payload) })
  },
  getCasinoHistory() {
    return publicRequest<{ history: CasinoState['history'] }>('/casino/history')
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
  createOrderPayment(orderId: number) {
    return publicRequest<{ payment: Payment }>(`/payments/orders/${orderId}/session`, { method: 'POST' })
  },
  getPayment(paymentId: number) {
    return publicRequest<{ payment: Payment }>(`/payments/${paymentId}`)
  },
  submitCryptoPayment(paymentId: number, payload: { transactionHash?: string; senderAddress?: string; tonConnectBoc?: string }) {
    return publicRequest<{ payment: Payment }>(`/payments/${paymentId}/crypto/submit`, { method: 'POST', body: JSON.stringify(payload) })
  },

  adminLogin(data: { password: string; mode?: 'admin' | 'owner' }) {
    return adminRequest<{ ok: boolean; role?: string; username?: string | null }>('/admin/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },
  adminLogout() {
    return adminRequest<{ ok: boolean }>('/admin/auth/logout', { method: 'POST' })
  },
  adminStatus() {
    return adminRequest<{ authenticated: boolean; role: string; username: string | null }>('/admin/auth/status')
  },
  adminChangePassword(data: { currentPassword: string; newPassword: string; target?: 'owner' | 'self' }) {
    return adminRequest<{ ok: boolean }>('/admin/auth/change-password', { method: 'POST', body: JSON.stringify(data) })
  },
  getAdminAdministrators() {
    return adminRequest<{ administrators: Administrator[] }>('/admin/administrators')
  },
  createAdministrator(data: { username?: string }) {
    return adminRequest<{ administrator: Administrator; generatedPassword: string }>('/admin/administrators', { method: 'POST', body: JSON.stringify(data) })
  },
  updateAdministrator(id: number, data: { username?: string; isActive?: boolean }) {
    return adminRequest<{ administrator: Administrator }>(`/admin/administrators/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  },
  resetAdministratorPassword(id: number) {
    return adminRequest<{ ok: boolean; generatedPassword: string }>(`/admin/administrators/${id}/reset-password`, { method: 'POST' })
  },
  deleteAdministrator(id: number) {
    return adminRequest<{ ok: boolean }>(`/admin/administrators/${id}`, { method: 'DELETE' })
  },
  getAdminSettings() {
    return adminRequest<{ shopName: string; depositCommissionPct: number }>('/admin/settings')
  },
  updateAdminSettings(data: { shopName?: string; depositCommissionPct?: number }) {
    return adminRequest<{ shopName: string; depositCommissionPct: number }>('/admin/settings', { method: 'PATCH', body: JSON.stringify(data) })
  },
  getAdminStats() {
    return adminRequest<AdminStats>('/admin/stats')
  },
  getAdminOrders(page = 1, status?: string) {
    const params = new URLSearchParams({ page: String(page) })
    if (status) params.set('status', status)
    return adminRequest<{ orders: AdminOrder[]; total: number; page: number; pages: number }>(`/admin/orders?${params}`)
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
  getAdminCities() {
    return adminRequest<{ cities: AdminCity[] }>('/admin/cities')
  },
  createAdminCity(data: { name: string; nameEn?: string; isActive?: boolean; sortOrder?: number }) {
    return adminRequest<{ city: AdminCity }>('/admin/cities', { method: 'POST', body: JSON.stringify(data) })
  },
  updateAdminCity(id: number, data: { name?: string; nameEn?: string | null; isActive?: boolean; sortOrder?: number }) {
    return adminRequest<{ city: AdminCity }>(`/admin/cities/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  },
  getAdminProducts() {
    return adminRequest<{ products: AdminProduct[] }>('/admin/products')
  },
  createAdminProduct(data: { name: string; nameEn?: string; description?: string; descriptionEn?: string; price: number; categoryId: number; image?: string; creditsEnabled?: boolean; creditsPrice?: number | null; minCreditsRequired?: number | null; isActive?: boolean; isRecommended?: boolean; cities?: { cityId: number; stock: number; isAvailable: boolean; minimumQuantity?: number; quantityStep?: number; maximumQuantity?: number; unit?: string }[] }) {
    return adminRequest<{ product: unknown }>('/admin/products', { method: 'POST', body: JSON.stringify(data) })
  },
  createAdminProductCity(data: { productId: number; cityId: number; stock?: number; isAvailable?: boolean; minimumQuantity?: number; quantityStep?: number; maximumQuantity?: number; unit?: string }) {
    return adminRequest<{ productCity: unknown }>('/admin/product-cities', { method: 'POST', body: JSON.stringify(data) })
  },
  updateAdminProduct(id: number, data: Partial<{ name: string; nameEn: string | null; description: string; descriptionEn: string | null; image: string | null; categoryId: number; price: number; creditsEnabled: boolean; creditsPrice: number | null; minCreditsRequired: number | null; isActive: boolean; isRecommended: boolean }>) {
    return adminRequest<{ product: ProductDetail }>(`/admin/products/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  },
  updateProductCity(id: number, data: Partial<{ stock: number; isAvailable: boolean; minimumQuantity: number; quantityStep: number; maximumQuantity: number; unit: string }>) {
    return adminRequest<{ productCity: unknown }>(`/admin/product-cities/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  },
  getAdminPickupStorages() {
    return adminRequest<{ storages: AdminPickupStorage[] }>('/admin/pickup-storages')
  },
  createAdminPickupStorage(data: {
    productId: number
    productCityId: number
    variantKey?: string | null
    quantity: number
    unit: string
    photoUrl?: string | null
    address: string
    instructions?: string | null
    isActive?: boolean
  }) {
    return adminRequest<{ storage: AdminPickupStorage }>('/admin/pickup-storages', { method: 'POST', body: JSON.stringify(data) })
  },
  updateAdminPickupStorage(id: number, data: Partial<{
    productId: number
    productCityId: number
    variantKey: string | null
    quantity: number
    unit: string
    photoUrl: string | null
    address: string
    instructions: string | null
    isActive: boolean
  }>) {
    return adminRequest<{ storage: AdminPickupStorage }>(`/admin/pickup-storages/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  },
  getAdminDiscounts() {
    return adminRequest<{ discounts: Discount[] }>('/admin/discounts')
  },
  createAdminDiscount(data: { code: string; type: string; value: number; minOrderAmount?: number; usageLimit?: number }) {
    return adminRequest<{ discount: Discount }>('/admin/discounts', { method: 'POST', body: JSON.stringify(data) })
  },
  updateAdminDiscount(id: number, data: { isActive?: boolean; usageLimit?: number | null; expiresAt?: string | null }) {
    return adminRequest<{ discount: Discount }>(`/admin/discounts/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  },
  getAdminDeliveryOptions() {
    return adminRequest<{ options: AdminDeliveryOption[] }>('/admin/delivery-options')
  },
  createAdminDeliveryOption(data: { name: string; nameEn?: string; type?: string; price?: number; isActive?: boolean; sortOrder?: number }) {
    return adminRequest<{ option: AdminDeliveryOption }>('/admin/delivery-options', { method: 'POST', body: JSON.stringify(data) })
  },
  updateAdminDeliveryOption(id: number, data: { name?: string; nameEn?: string | null; type?: string; price?: number; isActive?: boolean; sortOrder?: number }) {
    return adminRequest<{ option: AdminDeliveryOption }>(`/admin/delivery-options/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
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
  getAdminPayments() {
    return adminRequest<{ payments: AdminPaymentRecord[] }>('/admin/payments')
  },
  updateAdminPaymentStatus(id: number, data: { status: string; reason: string }) {
    return adminRequest<{ payment: Payment }>(`/admin/payments/${id}/status`, { method: 'PATCH', body: JSON.stringify(data) })
  },
  getAdminCasinoConfig() {
    return adminRequest<AdminCasinoConfig>('/admin/casino/config')
  },
  updateAdminCasinoGame(game: string, data: Partial<{ isEnabled: boolean; minBet: number; maxBet: number; spinLimit: number }>) {
    return adminRequest<{ game: unknown }>(`/admin/casino/games/${game}`, { method: 'PATCH', body: JSON.stringify(data) })
  },
  createAdminCasinoRewardConfig(data: Record<string, unknown>) {
    return adminRequest<{ rewardConfig: unknown }>('/admin/casino/reward-configs', { method: 'POST', body: JSON.stringify(data) })
  },
  updateAdminCasinoRewardConfig(id: number, data: Record<string, unknown>) {
    return adminRequest<{ rewardConfig: unknown }>(`/admin/casino/reward-configs/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  },
  getAdminCasinoHistory() {
    return adminRequest<{ history: unknown[] }>('/admin/casino/history')
  },
  adjustAdminCasinoCredits(data: { userId: number; amount: number; reason: string }) {
    return adminRequest<{ balance: unknown }>('/admin/casino/credits/adjust', { method: 'POST', body: JSON.stringify(data) })
  },
  getAdminCategories() {
    return adminRequest<{ categories: AdminCategory[] }>('/admin/categories')
  },
  createAdminCategory(data: { name: string; nameEn?: string; sortOrder?: number }) {
    return adminRequest<{ category: AdminCategory }>('/admin/categories', { method: 'POST', body: JSON.stringify(data) })
  },
  updateAdminCategory(id: number, data: { name?: string; nameEn?: string; isActive?: boolean; sortOrder?: number }) {
    return adminRequest<{ category: AdminCategory }>(`/admin/categories/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  },

  // ── Deposits ──────────────────────────────────────────────────────────────
  getDepositWallets() {
    return publicRequest<{ wallets: DepositWallet[]; commissionPct: number }>('/deposits/wallets')
  },
  getMyDeposits() {
    return publicRequest<{ deposits: DepositRequest[]; commissionPct: number }>('/deposits')
  },
  createDepositRequest(walletId: number, amountUsdt: number) {
    return publicRequest<{ deposit: DepositRequest }>('/deposits', {
      method: 'POST',
      body: JSON.stringify({ walletId, amountUsdt }),
    })
  },
  submitDepositTxHash(depositId: number, txHash: string) {
    return publicRequest<{ deposit: DepositRequest }>(`/deposits/${depositId}/txhash`, {
      method: 'PATCH',
      body: JSON.stringify({ txHash }),
    })
  },

  // ── Admin Deposits ────────────────────────────────────────────────────────
  getAdminDeposits(page = 1, status?: string) {
    const params = new URLSearchParams({ page: String(page) })
    if (status) params.set('status', status)
    return adminRequest<{ deposits: AdminDepositRequest[]; total: number; page: number; pages: number }>(`/admin/deposits?${params}`)
  },
  confirmAdminDeposit(id: number, note?: string) {
    return adminRequest<{ deposit: AdminDepositRequest }>(`/admin/deposits/${id}/confirm`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    })
  },
  rejectAdminDeposit(id: number, note?: string) {
    return adminRequest<{ deposit: AdminDepositRequest }>(`/admin/deposits/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    })
  },
}
