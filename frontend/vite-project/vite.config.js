import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api':       'http://localhost:3001',
      '/outputs':   'http://localhost:3001',
      '/templates': 'http://localhost:3001',
      '/footage':   'http://localhost:3001',
    }
  }
})
// https://vite.dev/config/
