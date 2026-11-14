import { defineConfig } from 'vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import { copyFileSync } from 'node:fs';

// Keep the single original Yekan Bakh FaNum CSS used by the storefront.
// The font bytes are not duplicated in Git; the existing source is copied only at build time.
copyFileSync(new URL('../frontend/brand-fonts.css', import.meta.url),
             new URL('./public/brand-fonts.css', import.meta.url));

export default defineConfig({
  plugins: [cloudflare()],
  server: { port: 5173 }
});
