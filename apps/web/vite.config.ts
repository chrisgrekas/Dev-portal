import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Σε dev, το /api προωθείται στο NestJS ώστε να μη χρειάζεται CORS.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: process.env.API_PROXY_TARGET ?? 'http://localhost:3000', changeOrigin: true },
    },
  },
});
