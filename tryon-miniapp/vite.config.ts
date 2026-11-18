import { defineConfig } from 'vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import { copyFileSync, mkdirSync } from 'node:fs';

// Copy the approved official logo at build time; never redraw it or commit a duplicate.
const assetsDir = new URL('./public/assets/', import.meta.url);
mkdirSync(assetsDir, {recursive:true});
copyFileSync(new URL('../telegram-miniapp/public/assets/logo.png', import.meta.url),
             new URL('./public/assets/logo.png', import.meta.url));

export default defineConfig({ plugins: [cloudflare()], server: { port: 5174 } });
