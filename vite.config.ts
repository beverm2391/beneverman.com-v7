import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  define: {
    __VERCEL_PRODUCTION_DEPLOY__: JSON.stringify(process.env.VERCEL_ENV === 'production'),
  },
  plugins: [react()],
})
