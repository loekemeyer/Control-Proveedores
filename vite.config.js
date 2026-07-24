import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// base = nombre EXACTO del repo (respeta mayúsculas), necesario para
// GitHub Pages: https://loekemeyer.github.io/Control-Proveedores/
export default defineConfig({
  root: path.resolve('client'),
  base: '/Control-Proveedores/',
  plugins: [react()],
  build: {
    outDir: path.resolve('dist'),
    emptyOutDir: true,
  },
});
