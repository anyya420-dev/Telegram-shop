import type { TelegramIdentity } from '../types'

type TelegramWebApp = {
  ready: () => void
  expand: () => void
  close?: () => void
  initData: string
  initDataUnsafe?: {
    user?: TelegramIdentity & { photo_url?: string }
  }
  setHeaderColor?: (color: string) => void
  setBackgroundColor?: (color: string) => void
  BackButton?: {
    show: () => void
    hide: () => void
    onClick: (handler: () => void) => void
    offClick: (handler: () => void) => void
  }
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
  last_name: 'Customer',
}

export function getTelegramContext() {
  const webApp = window.Telegram?.WebApp
  const allowDemoMode = (import.meta as { env?: Record<string, string | boolean> }).env?.PROD !== true

  if (webApp) {
    webApp.ready()
    webApp.expand()
    webApp.setHeaderColor?.('#080810')
    webApp.setBackgroundColor?.('#080810')
  }

  return {
    initData: webApp?.initData ?? '',
    user: webApp?.initDataUnsafe?.user ?? (allowDemoMode ? demoUser : undefined),
    isTelegramEnvironment: Boolean(webApp),
  }
}
