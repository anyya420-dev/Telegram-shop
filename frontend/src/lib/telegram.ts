import type { TelegramIdentity } from '../types'

type TelegramWebApp = {
  ready: () => void
  expand: () => void
  initData: string
  initDataUnsafe?: {
    user?: TelegramIdentity
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

const demoUser: TelegramIdentity = {
  id: '900000001',
  username: 'demo_customer',
  first_name: 'Demo',
}

export function getTelegramContext() {
  const webApp = window.Telegram?.WebApp

  if (webApp) {
    webApp.ready()
    webApp.expand()
    webApp.setHeaderColor?.('#0b1020')
    webApp.setBackgroundColor?.('#06090f')
  }

  return {
    initData: webApp?.initData ?? '',
    user: webApp?.initDataUnsafe?.user ?? demoUser,
    isTelegramEnvironment: Boolean(webApp),
  }
}
