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
  selectedCityId: number | null
  selectedCity: City | null
  language: Language
}

export type TelegramIdentity = {
  id: string
  username?: string
  first_name?: string
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
  image: string
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
}

export type BootstrapResponse = {
  telegramEnvironment: boolean
  sessionToken: string
  user: UserProfile
  cities: City[]
  categories: Category[]
}
