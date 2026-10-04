import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  root: 'lush-preview',
  publicDir: false,
  plugins: [react()],
  build: { outDir: '../dist-lush', emptyOutDir: true },
})
