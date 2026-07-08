import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { labScenes } from './vite/labScenes.ts'

// https://vite.dev/config/
export default defineConfig({
  define: {
    __VERCEL_PRODUCTION_DEPLOY__: JSON.stringify(process.env.VERCEL_ENV === 'production'),
  },
  plugins: [react(), tailwindcss(), labScenes()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
