import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

// base: './' aby appka fungovala i na GitHub Pages v podadresáři.
export default defineConfig({
  base: './',
  plugins: [tailwindcss()],
});
