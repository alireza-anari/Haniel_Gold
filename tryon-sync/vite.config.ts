import { defineConfig } from 'vite';
import { cloudflare } from '@cloudflare/vite-plugin';

// Internal Worker has no browser UI. Explicit entry avoids Vite's index.html default.
export default defineConfig({
  plugins: [cloudflare()],
  build: { rollupOptions: { input: './src/index.js' } },
});
