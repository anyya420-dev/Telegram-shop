export type Language = 'ru' | 'en'

export type LocalizedText = Partial<Record<Language, string>>

export type City = {
  id: number
  name: string
  nameTranslations?: LocalizedText | null
  isActive: boolean
}

export type Category = {
  id: number
  name: string
  nameTranslations?: LocalizedText | null
  isActive: boolean
  sortOrder: number
}

export type UserProfile = {
  id: number
  telegramId: string
  username: string | null
  firstName: string
  lastName?: string | null
  selectedCityId: number | null
  selectedCity: City | null
  language: Language
  balance?: number | null
  orderCount?: number | null
}

export type TelegramIdentity = {
  id: string
  username?: string
  first_name?: string
  photo_url?: string
}

export type ProductSummary = {
  id: number
  productCityId: number
  cityId: number
  name: string
  nameTranslations?: LocalizedText | null
  description: string
  descriptionTranslations?: LocalizedText | null
  price: number
  image: string | null
  categoryId: number
  categoryName: string
  categoryNameTranslations?: LocalizedText | null
  isRecommended: boolean
  stock: number
  isAvailable: boolean
  minimumQuantity: number
  quantityStep: number
  maximumQuantity: number
  unit: string
  unitTranslations?: LocalizedText | null
}

export type ProductDetail = ProductSummary

export type CartItem = {
  id: number
  quantity: number
  lineTotal: number
  productCity: ProductSummary
}

export type Cart = {
  id: number
  items: CartItem[]
  subtotal: number
  deliveryFee: number
  discount: number
  total: number
  discountCode?: string | null
}

export type BootstrapResponse = {
  telegramEnvironment: boolean
  sessionToken: string
  isAdmin: boolean
  user: UserProfile
  cities: City[]
  categories: Category[]
}

export type OrderItem = {
  id: number
  orderId: number
  productCityId: number
  productName: string
  productImage: string | null
  unit: string
  quantity: number
  price: number
  lineTotal: number
}

export type OrderStatusEntry = {
  id: number
  orderId: number
  status: string
  comment: string | null
  createdAt: string
}

export type DeliveryOption = {
  id: number
  name: string
  nameEn: string | null
  type: string
  price: number
}

export type Order = {
  id: number
  userId: number
  cityId: number
  status: string
  subtotal: number
  discountAmount: number
  deliveryFee: number
  total: number
  comment: string | null
  cancelledAt: string | null
  refundStatus: string | null
  createdAt: string
  items: OrderItem[]
  city: { id: number; name: string; nameEn: string | null }
  statusHistory: OrderStatusEntry[]
  deliveryOption: DeliveryOption | null
  discount: { id: number; code: string } | null
}

export type BalanceTransaction = {
  id: number
  type: string
  amount: number
  comment: string | null
  createdAt: string
}

export type Balance = {
  id: number
  userId: number
  amount: number
  transactions: BalanceTransaction[]
}

export type Review = {
  id: number
  userId: number
  productId: number
  rating: number
  comment: string | null
  createdAt: string
  user: { firstName: string; username: string | null }
}

export type SupportTicketReply = {
  id: number
  ticketId: number
  isAdmin: boolean
  message: string
  createdAt: string
}

export type SupportTicket = {
  id: number
  userId: number
  subject: string
  message: string
  status: string
  createdAt: string
  replies: SupportTicketReply[]
}

export type WishlistItem = {
  id: number
  product: ProductSummary
}

export type Discount = {
  id: number
  code: string
  type: string
  value: number
  minOrderAmount: number
}

export type AdminStats = {
  totalOrders: number
  pendingOrders: number
  totalUsers: number
  totalRevenue: number
}

export type BotInfo = {
  id: number
  username: string
  firstName: string
}

export type BotStatusResponse =
  | { connected: false; bot: null; tokenMasked?: string | null }
  | { connected: true; bot: BotInfo; lastValidatedAt: string | null; tokenMasked?: string | null }

export type AdminSettingsResponse = {
  administrators: string[]
  passwordConfigured: boolean
  bot: BotStatusResponse
}
