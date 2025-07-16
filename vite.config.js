import { defineConfig } from 'vite'

export default defineConfig({
  root: '.',
  server: {
    port: 8090,
    open: true
  },
  build: {
    outDir: 'dist'
  }
}) 