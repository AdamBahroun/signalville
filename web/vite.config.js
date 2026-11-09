import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En développement, les appels /api/... sont redirigés vers l'API Node (port 3000) :
// pas de problème CORS, et l'API n'a pas besoin d'être modifiée.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Les photos des signalements sont servies par l'API sous /uploads.
      '/uploads': 'http://localhost:3000',
      '/api': { target: 'http://localhost:3000', changeOrigin: true, rewrite: (chemin) => chemin.replace(/^\/api/, '') },
    },
  },
});
