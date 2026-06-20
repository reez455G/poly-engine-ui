import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://localhost:4175',
        changeOrigin: true
      }
    }
  },
  preview: {
    port: 4174,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:4175',
        changeOrigin: true
      }
    }
  }
})
