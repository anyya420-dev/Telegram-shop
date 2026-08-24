import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { api } from '../api/client'
import i18n from '../lib/i18n'
import { getTelegramContext } from '../lib/telegram'
import type { BootstrapResponse, Cart, Category, City, Language, Order, ProductSummary, UserProfile } from '../types'

const CITY_SELECTION_SKIPPED_KEY = 'telegram-shop-city-selection-skipped'

type AuthStatus = 'AUTH_LOADING' | 'AUTHENTICATED' | 'AUTHENTICATION_FAILED'
type BootstrapSnapshot = {
  response: BootstrapResponse
  products: ProductSummary[]
  cart: Cart
  recommended: ProductSummary[]
  citySelectionSkipped: boolean
  optionalError: string | null
}

type AppState = {
  authStatus: AuthStatus
  loading: boolean
  error: string | null
  telegramEnvironment: boolean
  isAdmin: boolean
  isOwner: boolean
  user: UserProfile | null
  cities: City[]
  categories: Category[]
  products: ProductSummary[]
  cart: Cart | null
  recommended: ProductSummary[]
  orders: Order[]
  ordersLoading: boolean
  citySelectionSkipped: boolean
  cityPickerOpen: boolean
  openCityPicker: () => void
  closeCityPicker: () => void
  skipCitySelection: () => void
  clearCitySelectionSkip: () => void
  refreshCities: () => Promise<City[]>
  refreshCatalog: (search?: string, categoryId?: number | 'all') => Promise<void>
  selectCity: (cityId: number) => Promise<void>
  updateLanguagePreference: (language: Language) => Promise<void>
  addToCart: (productCityId: number, quantity: number) => Promise<void>
  updateCartItem: (itemId: number, quantity: number) => Promise<void>
  removeCartItem: (itemId: number) => Promise<void>
  checkout: (options?: { comment?: string; discountCode?: string; deliveryOptionId?: number }) => Promise<Order>
  fetchOrders: () => Promise<void>
  setError: (value: string | null) => void
}

const AppContext = createContext<AppState | null>(null)
let bootstrapInFlight: Promise<BootstrapSnapshot> | null = null
let bootstrapInFlightKey: string | null = null
let cachedBootstrapSnapshot: BootstrapSnapshot | null = null
let cachedBootstrapKey: string | null = null

function getCitySelectionStorageKey(telegramId: string) {
  return `${CITY_SELECTION_SKIPPED_KEY}:${telegramId}`
}

function readCitySelectionSkipped(telegramId: string) {
  if (typeof window === 'undefined') {
    return false
  }

  return window.localStorage.getItem(getCitySelectionStorageKey(telegramId)) === 'true'
}

function writeCitySelectionSkipped(telegramId: string, skipped: boolean) {
  if (typeof window === 'undefined') {
    return
  }

  const key = getCitySelectionStorageKey(telegramId)
  if (skipped) {
    window.localStorage.setItem(key, 'true')
    return
  }

  window.localStorage.removeItem(key)
}

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

function translateError(error: unknown, fallbackKey: string) {
  if (error instanceof Error && 'code' in error && typeof error.code === 'string') {
    return i18n.t(`errors.${error.code}`)
  }

  return i18n.t(`errors.${fallbackKey}`)
}

async function bootstrapSession(initData: string) {
  const cacheKey = initData || '__demo__'

  if (cachedBootstrapSnapshot && cachedBootstrapKey === cacheKey) {
    return cachedBootstrapSnapshot
  }

  if (cachedBootstrapKey !== cacheKey) {
    cachedBootstrapSnapshot = null
    cachedBootstrapKey = null
  }

  if (!bootstrapInFlight || bootstrapInFlightKey !== cacheKey) {
    cachedBootstrapKey = cacheKey
    bootstrapInFlightKey = cacheKey
    api.setSessionToken(null)
    const currentPromise = (async () => {
      try {
        const response = await api.bootstrap({ initData })
        api.setSessionToken(response.sessionToken)

        let products: ProductSummary[] = []
        let cart = emptyCart()
        let recommended: ProductSummary[] = []
        let optionalError: string | null = null
        const citySelectionSkipped = !response.user.selectedCityId && readCitySelectionSkipped(response.user.telegramId)

        if (response.user.selectedCityId) {
          writeCitySelectionSkipped(response.user.telegramId, false)

          try {
            const [catalogResponse, cartResponse] = await Promise.all([
              api.getCatalog({ cityId: response.user.selectedCityId }),
              api.getCart(),
            ])
            products = catalogResponse.products
            cart = cartResponse.cart
            recommended = cartResponse.recommended
          } catch (error) {
            optionalError = translateError(error, 'catalog_refresh_failed')
          }
        }

        const snapshot = {
          response,
          products,
          cart,
          recommended,
          citySelectionSkipped,
          optionalError,
        } satisfies BootstrapSnapshot

        cachedBootstrapSnapshot = snapshot
        return snapshot
      } catch (error) {
        cachedBootstrapKey = null
        cachedBootstrapSnapshot = null
        throw error
      }
    })()
    bootstrapInFlight = currentPromise
    void currentPromise.finally(() => {
      if (bootstrapInFlight === currentPromise) {
        bootstrapInFlight = null
        bootstrapInFlightKey = null
      }
    })
  }

  return bootstrapInFlight!
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [authStatus, setAuthStatus] = useState<AuthStatus>('AUTH_LOADING')
  const [error, setError] = useState<string | null>(null)
  const [telegramEnvironment, setTelegramEnvironment] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isOwner, setIsOwner] = useState(false)
  const [user, setUser] = useState<UserProfile | null>(null)
  const [cities, setCities] = useState<City[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<ProductSummary[]>([])
  const [cart, setCart] = useState<Cart>(emptyCart())
  const [recommended, setRecommended] = useState<ProductSummary[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [citySelectionSkipped, setCitySelectionSkipped] = useState(false)
  const [cityPickerOpen, setCityPickerOpen] = useState(false)
  const latestCatalogRequestId = useRef(0)
  const latestOrdersRequestId = useRef(0)
  const citiesRequestRef = useRef<Promise<City[]> | null>(null)
  const catalogRequestRef = useRef<{ key: string; promise: Promise<void> } | null>(null)
  const ordersRequestRef = useRef<Promise<void> | null>(null)

  const loading = authStatus === 'AUTH_LOADING'

  function setLanguage(lang: Language) {
    void i18n.changeLanguage(lang)
  }

  const resetCityScopedState = useCallback(() => {
    setProducts([])
    setCart(emptyCart())
    setRecommended([])
  }, [])

  const refreshCities = useCallback(async () => {
    if (!citiesRequestRef.current) {
      citiesRequestRef.current = api.getCities()
        .then((nextCities) => {
          setCities(nextCities)
          return nextCities
        })
        .finally(() => {
          citiesRequestRef.current = null
        })
    }

    return citiesRequestRef.current
  }, [])

  const refreshCatalog = useCallback(async (search = '', categoryId: number | 'all' = 'all') => {
    if (!user?.selectedCityId) {
      setProducts([])
      return
    }

    const selectedCityId = user.selectedCityId
    const requestKey = JSON.stringify([selectedCityId, search, categoryId])
    if (catalogRequestRef.current?.key === requestKey) {
      return catalogRequestRef.current.promise
    }

    const requestId = ++latestCatalogRequestId.current
    const promise = (async () => {
      try {
        setError(null)
        const response = await api.getCatalog({ cityId: selectedCityId, search, categoryId })
        if (requestId === latestCatalogRequestId.current) {
          setProducts(response.products)
        }
      } catch (catalogError) {
        if (requestId === latestCatalogRequestId.current) {
          setError(translateError(catalogError, 'catalog_refresh_failed'))
        }
        throw catalogError
      }
    })().finally(() => {
      if (catalogRequestRef.current?.promise === promise) {
        catalogRequestRef.current = null
      }
    })

    catalogRequestRef.current = { key: requestKey, promise }
    return promise
  }, [user?.selectedCityId])

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      try {
        setAuthStatus('AUTH_LOADING')
        setError(null)
        const telegram = getTelegramContext()
        const snapshot = await bootstrapSession(telegram.initData)

        if (cancelled) {
          return
        }

        api.setSessionToken(snapshot.response.sessionToken)
        setTelegramEnvironment(snapshot.response.telegramEnvironment)
        setIsAdmin(snapshot.response.isAdmin ?? false)
        setIsOwner(snapshot.response.isOwner ?? false)
        setUser(snapshot.response.user)
        setLanguage(snapshot.response.user.language)
        setCities(snapshot.response.cities)
        setCategories(snapshot.response.categories)
        setCitySelectionSkipped(snapshot.citySelectionSkipped)
        setProducts(snapshot.products)
        setCart(snapshot.cart)
        setRecommended(snapshot.recommended)
        setAuthStatus('AUTHENTICATED')

        if (snapshot.optionalError) {
          setError(snapshot.optionalError)
        }
      } catch (bootstrapError) {
        if (cancelled) {
          return
        }

        api.setSessionToken(null)
        setTelegramEnvironment(false)
        setIsAdmin(false)
        setIsOwner(false)
        setUser(null)
        setCities([])
        setCategories([])
        setOrders([])
        setCitySelectionSkipped(false)
        resetCityScopedState()
        setError(translateError(bootstrapError, 'shop_load_failed'))
        setAuthStatus('AUTHENTICATION_FAILED')
      }
    }

    void bootstrap()
    return () => {
      cancelled = true
    }
  }, [])

  const selectCity = useCallback(async (cityId: number) => {
    if (!user) {
      return
    }

    try {
      setError(null)
      const response = await api.updateCity(cityId)
      setUser(response.user)
      setCityPickerOpen(false)
      writeCitySelectionSkipped(response.user.telegramId, false)
      setCitySelectionSkipped(false)

      const productsResponse = await api.getCatalog({ cityId })
      const cartResponse = await api.getCart()
      setProducts(productsResponse.products)
      setCart(cartResponse.cart)
      setRecommended(cartResponse.recommended)
    } catch (cityError) {
      setError(translateError(cityError, 'city_not_found'))
      throw cityError
    }
  }, [user])

  const updateLanguagePreference = useCallback(async (language: Language) => {
    if (!user || user.language === language) {
      return
    }

    try {
      setError(null)
      const response = await api.updateLanguage(language)
      setUser(response.user)
      void i18n.changeLanguage(response.user.language)
    } catch (languageError) {
      setError(translateError(languageError, 'language_update_failed'))
      throw languageError
    }
  }, [user])

  const addToCart = useCallback(async (productCityId: number, quantity: number) => {
    if (!user) {
      return
    }

    try {
      setError(null)
      const response = await api.addCartItem({ productCityId, quantity })
      setCart(response.cart)
      setRecommended(response.recommended)
    } catch (cartError) {
      setError(translateError(cartError, 'cart_update_failed'))
      throw cartError
    }
  }, [user])

  const updateCartItem = useCallback(async (itemId: number, quantity: number) => {
    if (!user) {
      return
    }

    try {
      setError(null)
      const response = await api.updateCartItem(itemId, { quantity })
      setCart(response.cart)
      setRecommended(response.recommended)
    } catch (cartError) {
      setError(translateError(cartError, 'cart_update_failed'))
      throw cartError
    }
  }, [user])

  const removeCartItem = useCallback(async (itemId: number) => {
    if (!user) {
      return
    }

    try {
      setError(null)
      const response = await api.removeCartItem(itemId)
      setCart(response.cart)
      setRecommended(response.recommended)
    } catch (cartError) {
      setError(translateError(cartError, 'cart_update_failed'))
      throw cartError
    }
  }, [user])

  const checkout = useCallback(async (options?: { comment?: string; discountCode?: string; deliveryOptionId?: number }) => {
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
      setError(translateError(checkoutError, 'checkout_failed'))
      throw checkoutError
    }
  }, [user])

  const fetchOrders = useCallback(async () => {
    if (!user) {
      return
    }

    if (!ordersRequestRef.current) {
      const requestId = ++latestOrdersRequestId.current
      ordersRequestRef.current = (async () => {
        try {
          setOrdersLoading(true)
          setError(null)
          const response = await api.getOrders()
          if (requestId === latestOrdersRequestId.current) {
            setOrders(response.orders)
          }
        } catch (ordersError) {
          if (requestId === latestOrdersRequestId.current) {
            setError(translateError(ordersError, 'orders_fetch_failed'))
          }
        } finally {
          if (requestId === latestOrdersRequestId.current) {
            setOrdersLoading(false)
          }
        }
      })().finally(() => {
        ordersRequestRef.current = null
      })
    }

    await ordersRequestRef.current
  }, [user])

  const openCityPicker = useCallback(() => {
    setCityPickerOpen(true)
    void refreshCities()
  }, [refreshCities])
  const closeCityPicker = useCallback(() => setCityPickerOpen(false), [])

  const skipCitySelection = useCallback(() => {
    if (user) {
      writeCitySelectionSkipped(user.telegramId, true)
    }
    setCitySelectionSkipped(true)
    setCityPickerOpen(false)
    resetCityScopedState()
  }, [resetCityScopedState, user])

  const clearCitySelectionSkip = useCallback(() => {
    if (user) {
      writeCitySelectionSkipped(user.telegramId, false)
    }
    setCitySelectionSkipped(false)
  }, [user])

  const value = useMemo(() => ({
    authStatus,
    loading,
    error,
    telegramEnvironment,
    isAdmin,
    isOwner,
    user,
    cities,
    categories,
    products,
    cart,
    recommended,
    orders,
    ordersLoading,
    citySelectionSkipped,
    cityPickerOpen,
    openCityPicker,
    closeCityPicker,
    skipCitySelection,
    clearCitySelectionSkip,
    refreshCities,
    refreshCatalog,
    selectCity,
    updateLanguagePreference,
    addToCart,
    updateCartItem,
    removeCartItem,
    checkout,
    fetchOrders,
    setError,
  } satisfies AppState), [
    authStatus,
    error,
    telegramEnvironment,
    isAdmin,
    isOwner,
    user,
    cities,
    categories,
    products,
    cart,
    recommended,
    orders,
    ordersLoading,
    citySelectionSkipped,
    cityPickerOpen,
    openCityPicker,
    closeCityPicker,
    skipCitySelection,
    clearCitySelectionSkip,
    refreshCities,
    refreshCatalog,
    selectCity,
    updateLanguagePreference,
    addToCart,
    updateCartItem,
    removeCartItem,
    checkout,
    fetchOrders,
  ])

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const context = useContext(AppContext)

  if (!context) {
    throw new Error('App context is unavailable')
  }

  return context
}
