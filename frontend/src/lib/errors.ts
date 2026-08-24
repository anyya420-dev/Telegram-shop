import type { TFunction } from 'i18next'
import { ApiError } from '../api/client'

export function resolveApiErrorMessage(error: unknown, t: TFunction, fallbackKey = 'request_failed') {
  if (error instanceof ApiError && error.code) {
    const translated = t(`errors.${error.code}`)
    if (translated !== `errors.${error.code}`) {
      return translated
    }
  }

  const fallback = t(`errors.${fallbackKey}`)
  if (fallback !== `errors.${fallbackKey}`) {
    return fallback
  }

  return t('errors.request_failed')
}
