import { useEffect } from 'react'
import type { NavigateFunction } from 'react-router-dom'
import { useLocation } from 'react-router-dom'

const IN_APP_HISTORY_KEY = 'tg_shop_in_app_history'
const IN_APP_HISTORY_LIMIT = 50

function readHistory() {
  if (typeof window === 'undefined') return [] as string[]
  try {
    const raw = window.sessionStorage.getItem(IN_APP_HISTORY_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return [] as string[]
    return parsed.filter((item): item is string => typeof item === 'string')
  } catch {
    return [] as string[]
  }
}

function writeHistory(history: string[]) {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(IN_APP_HISTORY_KEY, JSON.stringify(history.slice(-IN_APP_HISTORY_LIMIT)))
}

export function useInAppHistoryTracker() {
  const location = useLocation()

  useEffect(() => {
    const route = `${location.pathname}${location.search}`
    const history = readHistory()
    if (history[history.length - 1] === route) {
      return
    }
    history.push(route)
    writeHistory(history)
  }, [location.pathname, location.search])
}

export function getPreviousInAppRoute(currentRoute: string) {
  const history = readHistory()
  for (let index = history.length - 2; index >= 0; index -= 1) {
    if (history[index] !== currentRoute) {
      return history[index]
    }
  }
  return null
}

export function safeNavigateBack(navigate: NavigateFunction, currentRoute: string, fallbackRoute: string) {
  const previousRoute = getPreviousInAppRoute(currentRoute)
  if (previousRoute) {
    navigate(previousRoute)
    return
  }
  navigate(fallbackRoute)
}
