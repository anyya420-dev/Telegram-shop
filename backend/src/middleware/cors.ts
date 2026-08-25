import type { NextFunction, Request, Response } from 'express'

export const DEFAULT_ALLOWED_CORS_METHODS = 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS'
export const DEFAULT_ALLOWED_CORS_HEADERS = [
  'Content-Type',
  'Authorization',
  'X-Session-Token',
  'X-Requested-With',
].join(',')

const PREFLIGHT_MAX_AGE_SECONDS = '86400'
const VARY_VALUE = 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers'

/**
 * Normalizes an origin so that allowlist comparisons are stable:
 * lowercases scheme + host, drops default ports, trailing slashes and any path.
 * Returns null when the value is empty or cannot be interpreted as an http(s) origin.
 */
export function normalizeOrigin(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined') {
    return null
  }

  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null
    }
    return `${url.protocol.toLowerCase()}//${url.host.toLowerCase()}`
  } catch {
    return null
  }
}

export function buildAllowedOriginSet(origins: readonly string[]) {
  const normalized = new Set<string>()
  for (const origin of origins) {
    const value = normalizeOrigin(origin)
    if (value) {
      normalized.add(value)
    }
  }
  return normalized
}

export type CorsMiddlewareOptions = {
  allowedOrigins: readonly string[]
  onRejected?: (origin: string, request: Request) => void
}

/**
 * Strict, credential-safe CORS middleware.
 *
 * - Never emits `Access-Control-Allow-Origin: *` (incompatible with credentials).
 * - Always emits `Vary: Origin` so caches/CDNs never reuse a response across origins.
 * - Answers every OPTIONS request itself, before any auth/rate-limit/body middleware,
 *   so a preflight can never be rejected by a downstream guard.
 * - Non-OPTIONS requests without an `Origin` header (curl, Render health checks,
 *   server-to-server, Telegram webhooks) are passed through untouched and receive no
 *   CORS headers: CORS only applies to browsers.
 */
export function createCorsMiddleware({ allowedOrigins, onRejected }: CorsMiddlewareOptions) {
  const allowSet = buildAllowedOriginSet(allowedOrigins)

  return function corsMiddleware(request: Request, response: Response, next: NextFunction) {
    response.setHeader('Vary', VARY_VALUE)

    const rawOrigin = request.headers.origin
    const origin = normalizeOrigin(typeof rawOrigin === 'string' ? rawOrigin : null)

    if (!origin) {
      if (request.method === 'OPTIONS') {
        response.setHeader('Access-Control-Allow-Methods', DEFAULT_ALLOWED_CORS_METHODS)
        response.setHeader('Access-Control-Allow-Headers', DEFAULT_ALLOWED_CORS_HEADERS)
        response.status(204).end()
        return
      }
      next()
      return
    }

    if (!allowSet.has(origin)) {
      onRejected?.(origin, request)
      // Deliberately no Access-Control-Allow-Origin header: the browser must see a
      // real CORS failure rather than a partially-allowed response.
      response.status(403).json({
        code: 'cors_origin_not_allowed',
        message: 'Origin is not allowed by the server CORS policy',
      })
      return
    }

    response.setHeader('Access-Control-Allow-Origin', origin)
    response.setHeader('Access-Control-Allow-Credentials', 'true')

    if (request.method === 'OPTIONS') {
      const requestedHeaders = request.headers['access-control-request-headers']
      response.setHeader('Access-Control-Allow-Methods', DEFAULT_ALLOWED_CORS_METHODS)
      response.setHeader(
        'Access-Control-Allow-Headers',
        typeof requestedHeaders === 'string' && requestedHeaders.trim()
          ? requestedHeaders
          : DEFAULT_ALLOWED_CORS_HEADERS,
      )
      response.setHeader('Access-Control-Max-Age', PREFLIGHT_MAX_AGE_SECONDS)
      response.status(204).end()
      return
    }

    next()
  }
}
