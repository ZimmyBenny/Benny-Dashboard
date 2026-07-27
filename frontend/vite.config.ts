import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

/**
 * Dev-only: liefert ALLES mit `Cache-Control: no-store` aus, damit die Safari-Web-App
 * (PWA) niemals ein veraltetes Modul-Bundle festhält. Ursache wiederkehrender
 * „resolveDispatcher() null"-Crashes nach Vite-Neustarts war der hartnäckige
 * PWA-Cache, der trotz `no-cache` alte Deps behielt. `no-store` = gar kein Cache.
 * Auf localhost vernachlässigbarer Overhead, dafür immer frisch.
 */
function noStoreInDev() {
  return {
    name: 'no-store-dev',
    configureServer(server: { middlewares: { use: (fn: (req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => void) => void } }) {
      server.middlewares.use((_req, res, next) => {
        res.setHeader('Cache-Control', 'no-store');
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [
    noStoreInDev(),
    react(),
    tailwindcss(),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
