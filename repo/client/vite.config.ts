import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
// VITE_API_PORT lets Playwright E2E tests point the proxy at a dedicated
// test backend (e.g. port 3101) without touching the developer's server.
const apiPort = process.env.VITE_API_PORT || '3001';
const apiTarget = process.env.VITE_API_URL || `http://127.0.0.1:${apiPort}`;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    // Allow arbitrary Host headers. In Docker, clients reach the web service
    // via the Docker Compose DNS name ("web"), which is not a loopback host,
    // so Vite 5+ would otherwise reject it.
    allowedHosts: true,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
});
