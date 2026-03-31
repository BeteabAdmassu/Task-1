import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
// VITE_API_PORT lets Playwright E2E tests point the proxy at a dedicated
// test backend (e.g. port 3101) without touching the developer's server.
const apiPort = process.env.VITE_API_PORT || '3001';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
});
