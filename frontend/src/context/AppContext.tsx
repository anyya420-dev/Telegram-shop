import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { api } from '../api/client'
import i18n from '../lib/i18n'
import { getTelegramContext } from '../lib/telegram'
import type { Balance, Cart, Category, City, Language, Order, ProductSummary, UserProfile } from '../types'

type AppState = {
  loading: boolean
  error: string | null
  citiesLoading: boolean
  cartLoading: boolean
  telegramEnvironment: boolean
  user: UserProfile | null
  cities: City[]
  categories: Category[]
  products: ProductSummary[]
  cart: Cart | null
  recommended: ProductSummary[]
  orders: Order[]
  ordersLoading: boolean
  cityPickerOpen: boolean
  shopName: string
  userBalance: Balance | null
  balanceAmount: number
  openCityPicker: () => void
  closeCityPicker: () => void
  reloadCities: () => Promise<City[]>
  refreshCart: () => Promise<Cart>
  refreshCatalog: (search?: string, categoryId?: number | 'all', sort?: 'newest' | 'price_asc' | 'price_desc' | 'popular') => Promise<void>
  selectCity: (cityId: number) => Promise<void>
  updateLanguagePreference: (language: Language) => Promise<void>
  addToCart: (productCityId: number, quantity: number) => Promise<void>
  updateCartItem: (itemId: number, quantity: number) => Promise<void>
  removeCartItem: (itemId: number) => Promise<void>
  checkout: (options: { comment?: string; discountCode?: string; deliveryOptionId?: number; deliveryAddress?: string; paymentMethodId?: number; rewardId?: number; casinoCreditsToUse?: number }) => Promise<Order>
  fetchOrders: () => Promise<Order[]>
  setError: (value: string | null) => void
  refreshBalance: () => Promise<void>
}

const AppContext = createContext<AppState | null>(null)

function emptyCart(): Cart {
  return {
    id: 0,
    items: [],
    subtotal: 0,
    deliveryFee: 0,
    discount: 0,
    total: 0,
  }
}

function translateError(error: unknown, t: (key: string) => string, fallbackKey: string) {
  if (error instanceof Error && 'code' in error && typeof error.code === 'string') {
    return t(`errors.${error.code}`)
  }

  return t(`errors.${fallbackKey}`)
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [citiesLoading, setCitiesLoading] = useState(false)
  const [cartLoading, setCartLoading] = useState(false)
  const [telegramEnvironment, setTelegramEnvironment] = useState(false)
  const [user, setUser] = useState<UserProfile | null>(null)
  const [cities, setCities] = useState<City[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<ProductSummary[]>([])
  const [cart, setCart] = useState<Cart>(emptyCart())
  const [recommended, setRecommended] = useState<ProductSummary[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [cityPickerOpen, setCityPickerOpen] = useState(false)
  const [shopName, setShopName] = useState('Telegram Shop')
  const [userBalance, setUserBalance] = useState<Balance | null>(null)

  function t(key: string): string {
    return i18n.t(key)
  }

  async function reloadCities() {
    try {
      setCitiesLoading(true)
      const response = await api.getCities()
      setCities(response)
      return response
    } finally {
      setCitiesLoading(false)
    }
  }

  const refreshCatalog = useCallback(async (
    search = '',
    categoryId: number | 'all' = 'all',
    sort: 'newest' | 'price_asc' | 'price_desc' | 'popular' = 'newest',
  ) => {
    try {
      setError(null)
      const response = await api.getCatalog({ cityId: user?.selectedCityId ?? undefined, search, categoryId, sort })
      setProducts(response.products)
    } catch (catalogError) {
      setError(translateError(catalogError, t, 'catalog_refresh_failed'))
      throw catalogError
    }
  }, [t, user?.selectedCityId])

  async function refreshCart() {
    if (!user) {
      const nextCart = emptyCart()
      setCart(nextCart)
      setRecommended([])
      return nextCart
    }

    try {
      setCartLoading(true)
      setError(null)
      const cartResponse = await api.getCart()
      setCart(cartResponse.cart)
      setRecommended(cartResponse.recommended)
      return cartResponse.cart
    } catch (cartError) {
      setError(translateError(cartError, t, 'cart_update_failed'))
      throw cartError
    } finally {
      setCartLoading(false)
    }
  }

  useEffect(() => {
    async function bootstrap() {
      try {
        setLoading(true)
        setError(null)
        const telegram = getTelegramContext()
        api.setSessionToken(null)
        const response = await api.bootstrap({
          initData: telegram.initData,
          telegramUser: telegram.user,
          isTelegramEnvironment: telegram.isTelegramEnvironment,
        })

        api.setSessionToken(response.sessionToken)
        setTelegramEnvironment(response.telegramEnvironment)
        setUser(response.user)
        void i18n.changeLanguage(response.user.language)
        setCities(response.cities)
        setCitiesLoading(false)
        setCategories(response.categories)
        setShopName(response.shopName || 'Telegram Shop')
        document.title = response.shopName || 'Telegram Shop'

        setCartLoading(true)
        const [catalogResponse, cartResponse, balanceResponse] = await Promise.all([
          api.getCatalog({ cityId: response.user.selectedCityId ?? undefined }),
          api.getCart(),
          api.getBalance().catch(() => null),
        ])
        setProducts(catalogResponse.products)
        setCart(cartResponse.cart)
        setRecommended(cartResponse.recommended)
        if (balanceResponse) setUserBalance(balanceResponse.balance)
        setCartLoading(false)
      } catch (bootstrapError) {
        setError(translateError(bootstrapError, t, 'shop_load_failed'))
      } finally {
        setCartLoading(false)
        setLoading(false)
      }
    }

    void bootstrap()
  }, [])

  async function selectCity(cityId: number) {
    if (!user) {
      return
    }

    try {
      setError(null)
      const response = await api.updateCity(cityId)
      setUser(response.user)
      setCityPickerOpen(false)

      setCartLoading(true)
      const [productsResponse, cartResponse] = await Promise.all([
        api.getCatalog({ cityId }),
        api.getCart(),
      ])
      setProducts(productsResponse.products)
      setCart(cartResponse.cart)
      setRecommended(cartResponse.recommended)
    } catch (cityError) {
      setError(translateError(cityError, t, 'city_not_found'))
      throw cityError
    } finally {
      setCartLoading(false)
    }
  }

  async function updateLanguagePreference(language: Language) {
    if (!user || user.language === language) {
      return
    }

    try {
      setError(null)
      const response = await api.updateLanguage(language)
      setUser(response.user)
      void i18n.changeLanguage(response.user.language)
    } catch (languageError) {
      setError(translateError(languageError, t, 'language_update_failed'))
      throw languageError
    }
  }

  async function addToCart(productCityId: number, quantity: number) {
    if (!user) {
      return
    }

    try {
      setError(null)
      const response = await api.addCartItem({ productCityId, quantity })
      setCart(response.cart)
      setRecommended(response.recommended)
    } catch (cartError) {
      setError(translateError(cartError, t, 'cart_update_failed'))
      throw cartError
    }
  }

  async function updateCartItem(itemId: number, quantity: number) {
    if (!user) {
      return
    }

    try {
      setError(null)
      const response = await api.updateCartItem(itemId, { quantity })
      setCart(response.cart)
      setRecommended(response.recommended)
    } catch (cartError) {
      setError(translateError(cartError, t, 'cart_update_failed'))
      throw cartError
    }
  }

  async function removeCartItem(itemId: number) {
    if (!user) {
      return
    }

    try {
      setError(null)
      const response = await api.removeCartItem(itemId)
      setCart(response.cart)
      setRecommended(response.recommended)
    } catch (cartError) {
      setError(translateError(cartError, t, 'cart_update_failed'))
      throw cartError
    }
  }

  async function checkout(options: { comment?: string; discountCode?: string; deliveryOptionId?: number; deliveryAddress?: string; paymentMethodId?: number; rewardId?: number; casinoCreditsToUse?: number }) {
    if (!user) {
      throw new Error('User not loaded')
    }

    try {
      setError(null)
      const response = await api.checkout(options)
      setCart(response.cart)
      setRecommended(response.recommended)
      setOrders((prev) => [response.order, ...prev])
      return response.order
    } catch (checkoutError) {
      setError(translateError(checkoutError, t, 'checkout_failed'))
      throw checkoutError
    }
  }

  async function fetchOrders() {
    if (!user) {
      return []
    }

    try {
      setOrdersLoading(true)
      setError(null)
      const response = await api.getOrders()
      setOrders(response.orders)
      return response.orders
    } catch (ordersError) {
      setError(translateError(ordersError, t, 'orders_fetch_failed'))
      throw ordersError
    } finally {
      setOrdersLoading(false)
    }
  }

  async function refreshBalance() {
    try {
      const resp = await api.getBalance()
      setUserBalance(resp.balance)
    } catch {
      // silently ignore — balance chip will just stay stale
    }
  }

  const value = {
    loading,
    error,
    citiesLoading,
    cartLoading,
    telegramEnvironment,
    user,
    cities,
    categories,
    products,
    cart,
    recommended,
    orders,
    ordersLoading,
    cityPickerOpen,
    shopName,
    userBalance,
    balanceAmount: userBalance?.amount ?? 0,
    openCityPicker: () => setCityPickerOpen(true),
    closeCityPicker: () => setCityPickerOpen(false),
    reloadCities,
    refreshCart,
    refreshCatalog,
    selectCity,
    updateLanguagePreference,
    addToCart,
    updateCartItem,
    removeCartItem,
    checkout,
    fetchOrders,
    setError,
    refreshBalance,
  } satisfies AppState

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const context = useContext(AppContext)

  if (!context) {
    throw new Error('App context is unavailable')
  }

  return context
}
