#!/usr/bin/env node

const PRODUCTION = {
  frontendUrl: process.env.SMOKE_FRONTEND_URL?.trim() || 'https://telegram-shop-378j.onrender.com',
  backendUrl: process.env.SMOKE_BACKEND_URL?.trim() || 'https://telegram-shop-backend.onrender.com',
}
PRODUCTION.apiBaseUrl = `${PRODUCTION.backendUrl}/api`

const LOCAL_API_PATTERNS = [
  /https?:\/\/localhost(?::\d+)?\/api/i,
  /https?:\/\/127\.0\.0\.1(?::\d+)?\/api/i,
]
const RETIRED_API_PATTERNS = [
  /https?:\/\/telegram-shop\.onrender\.com(?:\/api)?/i,
  /https?:\/\/telegram-shop-3781\.onrender\.com(?:\/api)?/i,
  /https?:\/\/narcos-shop(?:-3781)?\.onrender\.com(?:\/api)?/i,
]

const checks = []
let cachedFrontendBundleText = null

function isBlockedError(error) {
  const message = String(error instanceof Error ? error.message : error).toLowerCase()
  return (
    message.includes('enotfound') ||
    message.includes('eai_again') ||
    message.includes('getaddrinfo') ||
    message.includes('network is unreachable') ||
    message.includes('fetch failed')
  )
}

async function runCheck(name, fn) {
  try {
    const details = await fn()
    checks.push({ name, status: 'PASS', details })
  } catch (error) {
    const blocked = isBlockedError(error)
    checks.push({
      name,
      status: blocked ? 'BLOCKED' : 'FAIL',
      details: error instanceof Error ? error.message : String(error),
    })
  }
}

function ensure(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

async function readText(url) {
  const response = await fetch(url)
  ensure(response.ok, `${url} returned ${response.status}`)
  return response.text()
}

async function readJson(url) {
  const response = await fetch(url)
  ensure(response.ok, `${url} returned ${response.status}`)
  return { response, body: await response.json() }
}

async function getFrontendBundleText() {
  if (cachedFrontendBundleText !== null) {
    return cachedFrontendBundleText
  }

  const html = await readText(PRODUCTION.frontendUrl)
  const assetMatches = [...html.matchAll(/src="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1])
  ensure(assetMatches.length > 0, 'no JS assets found in frontend HTML')
  const assetTexts = await Promise.all(assetMatches.map((path) => readText(`${PRODUCTION.frontendUrl}${path}`)))
  cachedFrontendBundleText = `${html}\n${assetTexts.join('\n')}`
  return cachedFrontendBundleText
}

await runCheck('frontend URL responds', async () => {
  const response = await fetch(PRODUCTION.frontendUrl)
  ensure(response.ok, `frontend returned ${response.status}`)
  return `${response.status}`
})

await runCheck('backend URL responds', async () => {
  const response = await fetch(PRODUCTION.backendUrl)
  ensure(response.ok, `backend returned ${response.status}`)
  return `${response.status}`
})

await runCheck('/health responds', async () => {
  const { body } = await readJson(`${PRODUCTION.backendUrl}/health`)
  ensure(body?.status === 'ok', `unexpected health payload: ${JSON.stringify(body)}`)
  return 'status=ok'
})

await runCheck('/ready responds', async () => {
  const response = await fetch(`${PRODUCTION.backendUrl}/ready`)
  ensure([200, 503].includes(response.status), `/ready returned ${response.status}`)
  let body
  try {
    body = await response.json()
  } catch {
    throw new Error('/ready did not return JSON')
  }
  ensure(body?.dependencies?.database === 'ok' || body?.dependencies?.database === 'error', 'invalid /ready payload')
  return `status=${response.status}`
})

await runCheck('/api/health responds', async () => {
  const { body } = await readJson(`${PRODUCTION.apiBaseUrl}/health`)
  ensure(body?.status === 'ok', `unexpected /api/health payload: ${JSON.stringify(body)}`)
  return 'status=ok'
})

await runCheck('/api/ready responds', async () => {
  const response = await fetch(`${PRODUCTION.apiBaseUrl}/ready`)
  ensure([200, 503].includes(response.status), `/api/ready returned ${response.status}`)
  return `status=${response.status}`
})

await runCheck('OPTIONS preflight for /api/session/bootstrap', async () => {
  const response = await fetch(`${PRODUCTION.apiBaseUrl}/session/bootstrap`, {
    method: 'OPTIONS',
    headers: {
      Origin: PRODUCTION.frontendUrl,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'Content-Type, Authorization',
    },
  })
  ensure([200, 204].includes(response.status), `preflight returned ${response.status}`)
  ensure(
    response.headers.get('access-control-allow-origin') === PRODUCTION.frontendUrl,
    'Access-Control-Allow-Origin mismatch',
  )
  ensure(response.headers.get('access-control-allow-credentials') === 'true', 'missing credentials header')
  ensure((response.headers.get('vary') ?? '').toLowerCase().includes('origin'), 'missing Vary: Origin')
  return `${response.status} + valid CORS headers`
})

await runCheck('wrong Origin is rejected safely', async () => {
  const response = await fetch(`${PRODUCTION.apiBaseUrl}/health`, {
    headers: {
      Origin: 'https://evil.example.com',
    },
  })
  ensure(response.status === 403, `expected 403 for disallowed origin, received ${response.status}`)
  ensure(response.headers.get('access-control-allow-origin') === null, 'disallowed origin should not receive ACAO')
  const body = await response.json()
  ensure(body?.code === 'cors_origin_not_allowed', 'unexpected disallowed-origin payload')
  return '403 + no ACAO'
})

await runCheck('session bootstrap endpoint reachable', async () => {
  const response = await fetch(`${PRODUCTION.apiBaseUrl}/session/bootstrap`, {
    method: 'POST',
    headers: {
      Origin: PRODUCTION.frontendUrl,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  })
  ensure([200, 400, 401, 403, 422, 503].includes(response.status), `unexpected status ${response.status}`)
  return `${response.status}`
})

await runCheck('admin endpoint is protected with JSON unauthorized response', async () => {
  const response = await fetch(`${PRODUCTION.apiBaseUrl}/admin/stats`, {
    headers: {
      Origin: PRODUCTION.frontendUrl,
    },
  })
  ensure(response.status === 401 || response.status === 403, `expected 401/403, received ${response.status}`)
  ensure((response.headers.get('content-type') ?? '').includes('application/json'), 'admin auth failure must return JSON')
  return `${response.status}`
})

await runCheck('frontend does not reference localhost API', async () => {
  const combined = await getFrontendBundleText()
  const localhostMatch = LOCAL_API_PATTERNS.find((pattern) => pattern.test(combined))
  ensure(!localhostMatch, 'frontend bundle contains localhost API URL')
  return 'no localhost API references'
})

await runCheck('frontend does not reference old Render API host', async () => {
  const combined = await getFrontendBundleText()
  const retiredMatch = RETIRED_API_PATTERNS.find((pattern) => pattern.test(combined))
  ensure(!retiredMatch, 'frontend bundle contains https://78j.onrender.com/api')
  return 'no retired host references'
})

console.log('Production smoke test results')
console.log('----------------------------------------')
for (const check of checks) {
  console.log(`${check.status.padEnd(7)} ${check.name} :: ${check.details}`)
}

const hasFail = checks.some((c) => c.status === 'FAIL')
const hasBlocked = checks.some((c) => c.status === 'BLOCKED')
if (hasFail) {
  process.exitCode = 1
} else if (hasBlocked) {
  process.exitCode = 2
}
