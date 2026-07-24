import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// base = nombre del repo, necesario para GitHub Pages (project pages).
// https://loekemeyer.github.io/contrlol-proveedores/
export default defineConfig({
  root: path.resolve('client'),
  base: '/contrlol-proveedores/',
  plugins: [react()],
  build: {
    outDir: path.resolve('dist'),
    emptyOutDir: true,
  },
});
