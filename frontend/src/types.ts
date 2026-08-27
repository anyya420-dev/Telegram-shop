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
  last_name?: string
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
  creditsEnabled?: boolean
  creditsPrice?: number | null
  minCreditsRequired?: number | null
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
  user: UserProfile
  cities: City[]
  categories: Category[]
  shopName?: string
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
  variantKey?: string | null
  pickupAssignment?: PickupStorageAssignment | null
}

export type PickupStorageAssignment = {
  id: number
  orderItemId: number
  pickupStorageId: number
  productName: string
  variantKey: string | null
  quantity: number
  unit: string
  photoUrl: string | null
  address: string
  instructions: string | null
  createdAt: string
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

export type PaymentMethod = {
  id: number
  type: 'card' | 'crypto'
  title: string
  currency: string | null
  provider?: string | null
  providerMode?: string | null
  providerKey?: string | null
  providerConfig?: string | null
  asset?: string | null
  network: string | null
  walletAddress: string | null
  displayName?: string | null
  instructions?: string | null
  sortOrder?: number
  isTonConnectEnabled?: boolean
  isEnabled: boolean
}

export type Payment = {
  id: number
  orderId: number
  paymentMethodId: number
  status: string
  amount: number
  currency: string | null
  asset?: string | null
  network: string | null
  provider?: string | null
  providerPaymentId?: string | null
  providerSessionId?: string | null
  checkoutUrl?: string | null
  recipient?: string | null
  senderAddress?: string | null
  transactionHash?: string | null
  referenceCode?: string | null
  failureReason?: string | null
  paidAt?: string | null
  expiresAt?: string | null
  createdAt: string
  updatedAt: string
  paymentMethod?: PaymentMethod
}

export type Order = {
  id: number
  userId: number
  cityId: number
  status: string
  paymentStatus: string | null
  subtotal: number
  discountAmount: number
  deliveryFee: number
  total: number
  comment: string | null
  deliveryAddress: string | null
  deliveryPriceConfirmed: boolean
  operatorDeliveryPrice: number | null
  paymentMethodId: number | null
  cancelledAt: string | null
  refundStatus: string | null
  createdAt: string
  items: OrderItem[]
  city: { id: number; name: string; nameEn: string | null }
  statusHistory: OrderStatusEntry[]
  paymentMethod: PaymentMethod | null
  deliveryOption: DeliveryOption | null
  discount: { id: number; code: string } | null
  reward?: CasinoReward | null
  rewardId?: number | null
  casinoCreditsUsed?: number
  payments?: Payment[]
  pickupStorageResolutionRequired?: boolean
}

export type BalanceTransaction = {
  id: number
  type: string
  amount: number
  status: string
  source: string | null
  adminId: number | null
  referenceId: number | null
  comment: string | null
  createdAt: string
}

export type Balance = {
  id: number
  userId: number
  amount: number
  transactions: BalanceTransaction[]
}

export type CasinoRound = {
  id: number
  game: string
  betAmount: number
  targetValue: string | null
  outcomeValue: string | null
  payoutAmount: number
  netChange: number
  isWin: boolean
  createdAt: string
  reward?: CasinoReward | null
}

export type CasinoReward = {
  id: number
  userId: number
  game: string
  rewardType: string
  status: string
  discountPercent: number | null
  creditAmount: number | null
  minOrderAmount?: number | null
  createdAt: string
  expiresAt: string | null
  usedAt: string | null
  orderId: number | null
}

export type CasinoGameConfig = {
  id: number
  game: string
  isEnabled: boolean
  minBet: number
  maxBet: number
  spinLimit: number
}

export type CasinoRewardConfig = {
  id: number
  game: string
  rewardType: string
  title: string
  resultKey: string | null
  discountPercent: number | null
  creditAmount: number | null
  weight: number
  isActive: boolean
  expiresInHours: number | null
  minOrderAmount: number | null
}

export type CasinoState = {
  balance: {
    id: number
    userId: number
    credits: number
    lifetimeWon?: number
    lifetimeSpent?: number
  }
  history: CasinoRound[]
  rewards?: CasinoReward[]
  games?: CasinoGameConfig[]
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
  usageLimit?: number | null
  usedCount?: number
  isActive?: boolean
  expiresAt?: string | null
}

export type AdminStats = {
  period: string
  totalOrders: number
  pendingOrders: number
  paidOrders: number
  cancelledOrders: number
  totalUsers: number
  newUsers: number
  totalRevenue: number
  depositCount: number
  depositUSDT: number
  depositCredited: number
  depositCommission: number
  casinoBetCount: number
  casinoBetTotal: number
  casinoWinTotal: number
  discountTotal: number
  virtualBalance: number
}

export type Administrator = {
  id: number
  username: string
  telegramId: string | null
  role: string
  permissions: string[]
  isActive: boolean
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export type AdminTelegramBot = {
  id: number
  botId: string
  username: string
  firstName: string
  isActive: boolean
  webAppUrl: string | null
  menuText: string | null
  maskedToken: string
  createdAt: string
  updatedAt: string
}

export type AdminCity = City & {
  nameEn?: string | null
  sortOrder: number
  _count?: {
    users: number
    productCities: number
    orders: number
  }
}

export type AdminCategory = Category & {
  nameEn?: string | null
  _count: {
    products: number
  }
}

export type AdminProductCity = {
  id: number
  cityId: number
  stock: number
  isAvailable: boolean
  minimumQuantity: number
  quantityStep: number
  maximumQuantity: number
  unit: string
  city: {
    id?: number
    name: string
  }
}

export type AdminPickupStorage = {
  id: number
  productId: number
  productCityId: number
  variantKey: string | null
  quantity: number
  unit: string
  photoUrl: string | null
  address: string
  instructions: string | null
  isActive: boolean
  status: string
  assignedAt: string | null
  createdAt: string
  updatedAt: string
  product: {
    id: number
    name: string
    nameEn: string | null
  }
  productCity: {
    id: number
    city: {
      id: number
      name: string
      nameEn: string | null
    }
  }
  assignedOrder: {
    id: number
    userId: number
    paymentStatus: string | null
    status: string
  } | null
  assignedOrderItem: {
    id: number
    productName: string
    quantity: number
    unit: string
  } | null
}

export type AdminProduct = {
  id: number
  name: string
  nameEn: string | null
  description: string
  descriptionEn: string | null
  price: number
  creditsEnabled?: boolean
  creditsPrice?: number | null
  minCreditsRequired?: number | null
  isActive: boolean
  isRecommended: boolean
  image: string | null
  categoryId: number
  category: {
    id?: number
    name: string
  }
  productCities: AdminProductCity[]
}

export type AdminOrder = Order & {
  user?: {
    id: number
    firstName: string
    username: string | null
    telegramId: string
  }
}

export type AdminCasinoConfig = {
  games: CasinoGameConfig[]
  rewardConfigs: CasinoRewardConfig[]
}

export type AdminDeliveryOption = DeliveryOption & {
  isActive?: boolean
  sortOrder?: number
  nameEn?: string | null
}

export type AdminPaymentRecord = Payment & {
  order?: {
    id: number
    status: string
    paymentStatus: string | null
    total: number
    user: {
      id: number
      telegramId: string
      firstName: string
      username: string | null
    }
  }
}

export type DepositWallet = {
  id: number
  title: string
  asset: string | null
  network: string | null
  walletAddress: string | null
  displayName: string | null
  instructions: string | null
  isTonConnectEnabled: boolean
}

export type DepositRequest = {
  id: number
  amountUsdt: number
  network: string
  asset: string
  walletAddress: string
  txHash: string | null
  status: 'pending' | 'confirmed' | 'rejected'
  creditedAmount: number | null
  commissionPct: number | null
  adminNote: string | null
  confirmedAt: string | null
  createdAt: string
}

export type AdminDepositRequest = DepositRequest & {
  userId: number
  user: {
    id: number
    telegramId: string
    firstName: string
    username: string | null
  }
}
