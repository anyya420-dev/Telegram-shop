import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolveApiBaseUrl } from './src/lib/apiConfig'

export default defineConfig(({ command, mode }) => {
  if (command === 'build' && mode === 'production') {
    const resolution = resolveApiBaseUrl(process.env.VITE_API_URL, true)
    if (resolution.error) {
      throw new Error(`[vite-config] ${resolution.error}`)
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
