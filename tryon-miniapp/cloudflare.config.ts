import { bindings, defineConfig } from 'cf/config';

// A separate Worker and separate catalog database. NEVER bind to haniel-gold-db.
// No BOT_TOKEN, OWNER_TELEGRAM_ID, manager Worker service binding or accounting DB.
export default defineConfig(({ isPreview }) => ({
  worker: {
    name: 'haniel-gold-tryon',
    entrypoint: './src/index.js',
    compatibilityDate: '2026-11-13',
    workersDev: true,
    assets: { runWorkerFirst: ['/api/*'] },
    env: {
      ASSETS: bindings.assets(),
      CATALOG_DB: bindings.d1({ name: isPreview ? 'haniel-tryon-public-test' : 'haniel-tryon-public' }),
      TRYON_PUBLIC_ENABLED: bindings.text(isPreview ? '1' : '0')
    }
  }
}));
