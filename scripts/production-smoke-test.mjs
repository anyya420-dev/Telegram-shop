#!/usr/bin/env node

const PRODUCTION = {
  frontendUrl: 'https://telegram-shop-3781.onrender.com',
  backendUrl: 'https://narcos-shop.onrender.com',
  apiBaseUrl: 'https://narcos-shop.onrender.com/api',
  allowedOrigin: 'https://telegram-shop-3781.onrender.com',
}

const BAD_PATTERNS = [
  /https?:\/\/localhost(?::\d+)?\/api/gi,
  /https?:\/\/127\.0\.0\.1(?::\d+)?\/api/gi,
  /https?:\/\/78j\.onrender\.com\/api/gi,
]

const checks = []

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
  const body = await response.json()
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
      Origin: PRODUCTION.allowedOrigin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'Content-Type, Authorization',
    },
  })
  ensure(response.status === 204, `preflight returned ${response.status}`)
  ensure(
    response.headers.get('access-control-allow-origin') === PRODUCTION.allowedOrigin,
    'Access-Control-Allow-Origin mismatch',
  )
  ensure(response.headers.get('access-control-allow-credentials') === 'true', 'missing credentials header')
  ensure((response.headers.get('vary') ?? '').toLowerCase().includes('origin'), 'missing Vary: Origin')
  return '204 + valid CORS headers'
})

await runCheck('session bootstrap endpoint reachable', async () => {
  const response = await fetch(`${PRODUCTION.apiBaseUrl}/session/bootstrap`, {
    method: 'POST',
    headers: {
      Origin: PRODUCTION.allowedOrigin,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  })
  ensure([400, 401, 403, 503].includes(response.status), `unexpected status ${response.status}`)
  return `${response.status}`
})

await runCheck('frontend does not reference localhost API', async () => {
  const html = await readText(PRODUCTION.frontendUrl)
  const assetMatches = [...html.matchAll(/src="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1])
  ensure(assetMatches.length > 0, 'no JS assets found in frontend HTML')
  const assetTexts = await Promise.all(assetMatches.map((path) => readText(`${PRODUCTION.frontendUrl}${path}`)))
  const combined = `${html}\n${assetTexts.join('\n')}`
  ensure(!BAD_PATTERNS[0].test(combined), 'frontend bundle contains localhost API URL')
  ensure(!BAD_PATTERNS[1].test(combined), 'frontend bundle contains 127.0.0.1 API URL')
  return 'no localhost API references'
})

await runCheck('frontend does not reference old Render API host', async () => {
  const html = await readText(PRODUCTION.frontendUrl)
  const assetMatches = [...html.matchAll(/src="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1])
  const assetTexts = await Promise.all(assetMatches.map((path) => readText(`${PRODUCTION.frontendUrl}${path}`)))
  const combined = `${html}\n${assetTexts.join('\n')}`
  ensure(!BAD_PATTERNS[2].test(combined), 'frontend bundle contains https://78j.onrender.com/api')
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
