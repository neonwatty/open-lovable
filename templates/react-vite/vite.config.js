import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: {{port}},
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})