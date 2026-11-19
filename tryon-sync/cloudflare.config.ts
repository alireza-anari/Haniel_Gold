import { bindings, defineConfig } from 'cf/config';

// Private internal source service. It has no public route or workers.dev URL.
// The Manager D1 is available only here; the publisher calls this Worker via Service Binding.
export default defineConfig(({ isPreview }) => ({
  worker: {
    name: isPreview ? 'haniel-tryon-catalog-sync-preview' : 'haniel-tryon-catalog-sync',
    entrypoint: './src/index.js',
    compatibilityDate: '2026-11-13',
    workersDev: false,
    observability: { enabled: true, traces: { enabled: true } },
    env: {
      SOURCE_DB: bindings.d1({ name: isPreview ? 'haniel-gold-tryon-test' : 'haniel-gold-db' }),
      CATALOG_DB: bindings.d1({ name: isPreview ? 'haniel-tryon-public-test' : 'haniel-tryon-public' }),
      SOURCE_API_SECRET: bindings.secret(),
      SYNC_ENABLED: bindings.text('0'),
    },
  },
}));
