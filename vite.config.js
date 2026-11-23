import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // VITE_BASE is set to /RegiSpot/ in the GitHub Actions pages.yml build.
  // Falls back to '/' for local dev so paths like /dashboard still resolve.
  base: process.env.VITE_BASE || '/',
  plugins: [tailwindcss(), react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
})
