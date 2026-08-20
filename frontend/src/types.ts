export type City = {
  id: number
  name: string
  isActive: boolean
}

export type Category = {
  id: number
  name: string
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
  description: string
  price: number
  image: string
  categoryId: number
  categoryName: string
  isRecommended: boolean
  stock: number
  isAvailable: boolean
  minimumQuantity: number
  quantityStep: number
  maximumQuantity: number
  unit: string
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
  user: UserProfile
  cities: City[]
  categories: Category[]
}
