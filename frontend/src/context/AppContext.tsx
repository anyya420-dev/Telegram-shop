import { createContext, useContext, useEffect, useState } from 'react'
import { api } from '../api/client'
import { useI18n } from '../i18n'
import { getTelegramContext } from '../lib/telegram'
import type { Cart, Category, City, Language, ProductSummary, UserProfile } from '../types'

type AppState = {
  loading: boolean
  error: string | null
  telegramEnvironment: boolean
  user: UserProfile | null
  cities: City[]
  categories: Category[]
  products: ProductSummary[]
  cart: Cart | null
  recommended: ProductSummary[]
  cityPickerOpen: boolean
  openCityPicker: () => void
  closeCityPicker: () => void
  refreshCatalog: (search?: string, categoryId?: number | 'all') => Promise<void>
  selectCity: (cityId: number) => Promise<void>
  updateLanguagePreference: (language: Language) => Promise<void>
  addToCart: (productCityId: number, quantity: number) => Promise<void>
  updateCartItem: (itemId: number, quantity: number) => Promise<void>
  removeCartItem: (itemId: number) => Promise<void>
  setError: (value: string | null) => void
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

function translateError(
  error: unknown,
  t: (key: string) => string,
  fallbackKey: string,
) {
  if (error instanceof Error && 'code' in error && typeof error.code === 'string') {
    return t(`errors.${error.code}`)
  }

  return t(`errors.${fallbackKey}`)
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [telegramEnvironment, setTelegramEnvironment] = useState(false)
  const [user, setUser] = useState<UserProfile | null>(null)
  const [cities, setCities] = useState<City[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<ProductSummary[]>([])
  const [cart, setCart] = useState<Cart>(emptyCart())
  const [recommended, setRecommended] = useState<ProductSummary[]>([])
  const [cityPickerOpen, setCityPickerOpen] = useState(false)
  const { setLanguage, t } = useI18n()

  async function refreshCatalog(search = '', categoryId: number | 'all' = 'all') {
    if (!user?.selectedCityId) {
      setProducts([])
      return
    }

    try {
      const response = await api.getCatalog({ cityId: user.selectedCityId, search, categoryId })
      setProducts(response.products)
    } catch (catalogError) {
      setError(translateError(catalogError, t, 'catalog_refresh_failed'))
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
        setLanguage(response.user.language)
        setCities(response.cities)
        setCategories(response.categories)

        if (!response.user.selectedCityId) {
          setCityPickerOpen(true)
        } else {
          const [catalogResponse, cartResponse] = await Promise.all([
            api.getCatalog({ cityId: response.user.selectedCityId }),
            api.getCart(),
          ])
          setProducts(catalogResponse.products)
          setCart(cartResponse.cart)
          setRecommended(cartResponse.recommended)
        }
      } catch (bootstrapError) {
        setError(translateError(bootstrapError, t, 'shop_load_failed'))
      } finally {
        setLoading(false)
      }
    }

    void bootstrap()
  }, [setLanguage])

  async function selectCity(cityId: number) {
    if (!user) {
      return
    }

    try {
      setError(null)
      const response = await api.updateCity(cityId)
      setUser(response.user)
      setCityPickerOpen(false)

      const productsResponse = await api.getCatalog({ cityId })
      const cartResponse = await api.getCart()
      setProducts(productsResponse.products)
      setCart(cartResponse.cart)
      setRecommended(cartResponse.recommended)
    } catch (cityError) {
      const translatedError = translateError(cityError, t, 'city_not_found')
      setError(translatedError)
      throw cityError
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
      setLanguage(response.user.language)
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

  const value = {
    loading,
    error,
    telegramEnvironment,
    user,
    cities,
    categories,
    products,
    cart,
    recommended,
    cityPickerOpen,
    openCityPicker: () => setCityPickerOpen(true),
    closeCityPicker: () => setCityPickerOpen(false),
    refreshCatalog,
    selectCity,
    updateLanguagePreference,
    addToCart,
    updateCartItem,
    removeCartItem,
    setError,
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
