import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Local development Vite configuration with dynamic port
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5184,
    strictPort: true,
    hmr: {
      port: 5185
    },
    cors: {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET, POST, PUT, DELETE, OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization, X-Requested-With","Access-Control-Allow-Credentials":"true"},
    allowedHosts: ['localhost', '127.0.0.1']
  }
})