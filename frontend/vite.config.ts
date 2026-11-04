import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // The Cloudflare Tunnel preserves the public Host header in dev mode.
    allowedHosts: ['memento.kdessinger.com'],
  },
})
