import { defineConfig } from 'vite';

// Relative paths so the built folder works from a file server, a USB stick or GitHub Pages.
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
});
