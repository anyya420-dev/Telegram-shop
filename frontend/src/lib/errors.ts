import { ApiError } from '../api/client'

export function getErrorMessage(
  error: unknown,
  t: (key: string) => string,
  fallbackKey: string,
) {
  if (error instanceof ApiError && error.code) {
    return t(`errors.${error.code}`)
  }

  return t(`errors.${fallbackKey}`)
}
