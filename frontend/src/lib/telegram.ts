type TelegramWebApp = {
  ready: () => void
  expand: () => void
  initData: string
  viewportHeight?: number
  viewportStableHeight?: number
  onEvent?: (eventType: string, callback: () => void) => void
  offEvent?: (eventType: string, callback: () => void) => void
  initDataUnsafe?: {
    user?: {
      photo_url?: string
    }
  }
  setHeaderColor?: (color: string) => void
  setBackgroundColor?: (color: string) => void
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp
    }
  }
}

let initialized = false

function setAppViewportHeight(webApp?: TelegramWebApp) {
  if (typeof window === 'undefined') {
    return
  }

  const telegramHeight = webApp?.viewportStableHeight ?? webApp?.viewportHeight
  const fallbackHeight = window.visualViewport?.height ?? window.innerHeight
  const nextHeight = telegramHeight ?? fallbackHeight

  if (Number.isFinite(nextHeight) && nextHeight > 0) {
    window.document.documentElement.style.setProperty('--app-height', `${Math.floor(nextHeight)}px`)
  }
}

export type TelegramContext = {
  initData: string
  isTelegramEnvironment: boolean
  /** True when the Telegram SDK is present but did not provide signed initData. */
  hasEmptyInitData: boolean
}

export function getTelegramContext(): TelegramContext {
  const webApp = typeof window === 'undefined' ? undefined : window.Telegram?.WebApp

  if (webApp) {
    if (!initialized) {
      initialized = true

      try {
        // ready() must be the first call so Telegram stops showing its own
        // loading placeholder and exposes the final viewport metrics.
        webApp.ready()
        webApp.expand()
        webApp.setHeaderColor?.('#080810')
        webApp.setBackgroundColor?.('#080810')
      } catch {
        // no-op, WebApp init should never hard-fail rendering
      }

      const handleViewportChange = () => setAppViewportHeight(window.Telegram?.WebApp)
      webApp.onEvent?.('viewportChanged', handleViewportChange)
      window.addEventListener('resize', handleViewportChange, { passive: true })
    }

    setAppViewportHeight(webApp)
  } else {
    setAppViewportHeight(undefined)
  }

  const initData = webApp?.initData ?? ''

  return {
    initData,
    isTelegramEnvironment: Boolean(webApp),
    hasEmptyInitData: Boolean(webApp) && initData.length === 0,
  }
}
