import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolveApiBaseUrl } from './src/lib/apiConfig.ts'

const RETIRED_BACKEND_HOSTS = new Set(['78j.onrender.com'])

export default defineConfig(({ command, mode }) => {
  if (command === 'build' && mode === 'production') {
    const resolution = resolveApiBaseUrl(process.env.VITE_API_URL, true)
    if (resolution.error) {
      throw new Error(`[vite-config] ${resolution.error}`)
    }
    const configuredHost = new URL(resolution.baseUrl).hostname.toLowerCase()
    if (RETIRED_BACKEND_HOSTS.has(configuredHost)) {
      throw new Error(
        `[vite-config] VITE_API_URL points to a retired backend host (${configuredHost}); update Render frontend VITE_API_URL`,
      )
    }
  }

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': 'http://localhost:3001',
      },
    },
  }
})
