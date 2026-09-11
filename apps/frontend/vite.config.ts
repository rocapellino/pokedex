import { defineConfig } from 'vite';
import { resolve } from 'path';

const currentDir = import.meta.dirname || process.cwd();

export default defineConfig({
  root: resolve(currentDir),
  publicDir: resolve(currentDir, 'public'),
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
