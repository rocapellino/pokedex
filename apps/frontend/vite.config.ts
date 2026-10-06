import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'path';
import { versionStylesheetLinks } from './css-version';

const currentDir = import.meta.dirname || process.cwd();

/** Añade a los enlaces del CSS la huella de su contenido para invalidar la caché tras cada cambio. */
function stylesheetCacheBusting(): Plugin {
  return {
    name: 'stylesheet-cache-busting',
    transformIndexHtml: (html) =>
      versionStylesheetLinks(html, readFileSync(resolve(currentDir, 'public/css/style.css'), 'utf-8')),
  };
}

export default defineConfig({
  root: resolve(currentDir),
  publicDir: resolve(currentDir, 'public'),
  plugins: [stylesheetCacheBusting()],
  build: {
    outDir: resolve(currentDir, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(currentDir, 'index.html'),
        backoffice: resolve(currentDir, 'backoffice.html'),
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/pokemons': 'http://localhost:3000',
      '/api': 'http://localhost:3000',
      '/healthz': 'http://localhost:3000',
      '/version': 'http://localhost:3000',
      '/metrics': 'http://localhost:3000',
    },
  },
});
