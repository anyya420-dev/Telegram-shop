type TelegramWebApp = {
  ready: () => void
  expand: () => void
  initData: string
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

export function getTelegramContext() {
  const webApp = window.Telegram?.WebApp

  if (webApp) {
    webApp.ready()
    webApp.expand()
    webApp.setHeaderColor?.('#080810')
    webApp.setBackgroundColor?.('#080810')
  }

  return {
    initData: webApp?.initData ?? '',
    isTelegramEnvironment: Boolean(webApp),
  }
}
