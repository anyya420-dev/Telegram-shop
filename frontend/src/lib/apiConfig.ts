/**
 * Resolves and validates the API base URL for the Telegram Mini App.
 *
 * Production builds bake `VITE_API_URL` in at build time (see render.yaml).
 * It must be an absolute https URL that includes the `/api` path segment,
 * e.g. `https://narcos-shop.onrender.com/api`.
 *
 * In local development the Vite dev-server proxy forwards `/api/*` to the
 * backend, so a relative `/api` base is the correct default there.
 */

const LOCALHOST_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'])
const FORBIDDEN_PRODUCTION_API_HOSTNAMES = new Set(['78j.onrender.com'])

export type ApiBaseResolution = {
  baseUrl: string
  error: string | null
}

function isLocalhostUrl(value: string) {
  try {
    const url = new URL(value)
    return LOCALHOST_HOSTNAMES.has(url.hostname.toLowerCase())
  } catch {
    return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?(\/|$)/i.test(value)
  }

  function hasForbiddenProductionHost(value: string) {
    try {
      const url = new URL(value)
      return FORBIDDEN_PRODUCTION_API_HOSTNAMES.has(url.hostname.toLowerCase())
    } catch {
      return false
    }
  }
}

/** Removes trailing slashes so `${base}${path}` never produces a double slash. */
export function normalizeApiBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, '')
}

export function resolveApiBaseUrl(
  rawApiUrl: string | undefined,
  isProduction: boolean,
): ApiBaseResolution {
  const configured = normalizeApiBaseUrl(rawApiUrl ?? '')

  if (!isProduction) {
    return { baseUrl: configured || '/api', error: null }
  }

  if (!configured) {
    return {
      baseUrl: '',
      error:
        'VITE_API_URL is not set. The production build must be created with ' +
        'VITE_API_URL=https://narcos-shop.onrender.com/api',
    }
  }

  if (!/^https?:\/\//i.test(configured)) {
    return {
      baseUrl: '',
      error: `VITE_API_URL must be an absolute http(s) URL in production (received "${configured}")`,
    }
  }

  if (isLocalhostUrl(configured)) {
    return {
      baseUrl: '',
      error: `VITE_API_URL must not target localhost in production (received "${configured}")`,
    }
  }

  if (hasForbiddenProductionHost(configured)) {
    return {
      baseUrl: '',
      error: `VITE_API_URL points to a retired backend host and must be updated (received "${configured}")`,
    }
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(configured)
  } catch {
    return {
      baseUrl: '',
      error: `VITE_API_URL must be a valid URL in production (received "${configured}")`,
    }
  }

  if (parsedUrl.protocol !== 'https:') {
    return {
      baseUrl: '',
      error: `VITE_API_URL must use HTTPS in production (received "${configured}")`,
    }
  }

  if (parsedUrl.pathname !== '/api') {
    return {
      baseUrl: '',
      error: `VITE_API_URL must point to the backend /api base in production (received "${configured}")`,
    }
  }

  return { baseUrl: configured, error: null }
}
