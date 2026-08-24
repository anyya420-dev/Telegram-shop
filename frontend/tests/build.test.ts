import assert from 'node:assert/strict'
import test from 'node:test'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const viteBin = resolve(frontendRoot, '..', 'node_modules', 'vite', 'bin', 'vite.js')
const outDir = join(frontendRoot, '.build-check')
const PRODUCTION_API_URL = 'https://narcos-shop.onrender.com/api'

function readBundledJs() {
  const assetsDir = join(outDir, 'assets')
  return readdirSync(assetsDir)
    .filter((file) => file.endsWith('.js'))
    .map((file) => readFileSync(join(assetsDir, file), 'utf8'))
    .join('\n')
}

test('production bundle bakes in VITE_API_URL and contains no localhost API fallback', () => {
  rmSync(outDir, { recursive: true, force: true })

  execFileSync(
    process.execPath,
    [viteBin, 'build', '--outDir', outDir],
    {
      cwd: frontendRoot,
      env: { ...process.env, VITE_API_URL: PRODUCTION_API_URL, NODE_ENV: 'production' },
      stdio: 'pipe',
    },
  )

  assert.ok(existsSync(join(outDir, 'index.html')), 'expected the build to produce index.html')

  const bundle = readBundledJs()
  assert.ok(
    bundle.split(PRODUCTION_API_URL).length > 1,
    'expected the production bundle to contain the configured VITE_API_URL',
  )
  assert.ok(
    !/https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/api/i.test(bundle),
    'production bundle must not contain a localhost API endpoint',
  )

  rmSync(outDir, { recursive: true, force: true })
})
