import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

/**
 * Dev-only: liefert ALLES mit `Cache-Control: no-store` aus, damit die Safari-Web-App
 * (PWA) niemals ein veraltetes Modul-Bundle festhält. Ursache wiederkehrender
 * „resolveDispatcher() null"-Crashes UND „neue Buttons fehlen"-Fälle war der hartnäckige
 * PWA-Cache, der trotz `no-cache` alte Module behielt. `no-store` = gar kein Cache.
 *
 * WICHTIG (Bugfix 2026-08-14): Ein einfaches `res.setHeader('Cache-Control','no-store')`
 * in der Middleware wirkte NICHT — Vites eigene transformMiddleware setzt danach
 * `Cache-Control: no-cache` + `ETag` und überschrieb unseren Header (nachweisbar per
 * `curl -D-`). Deshalb kapern wir `res.setHeader`: jeder spätere Cache-Control-Versuch
 * wird auf `no-store` gezwungen, und ETag/Last-Modified werden unterdrückt (mit ETag
 * würde die PWA weiter über 304 revalidieren statt frisch zu laden).
 */
function noStoreInDev() {
  return {
    name: 'no-store-dev',
    configureServer(server: { middlewares: { use: (fn: (req: unknown, res: { setHeader: (k: string, v: unknown) => unknown }, next: () => void) => void) => void } }) {
      server.middlewares.use((_req, res, next) => {
        const orig = res.setHeader.bind(res);
        res.setHeader = (name: string, value: unknown) => {
          const n = String(name).toLowerCase();
          if (n === 'cache-control') return orig('Cache-Control', 'no-store');
          if (n === 'etag' || n === 'last-modified') return res; // unterdrücken -> keine 304-Revalidierung
          return orig(name, value);
        };
        orig('Cache-Control', 'no-store'); // Fallback, falls kein Handler Cache-Control setzt
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
