import { bindings, defineConfig } from 'cf/config';

// Dedicated owner-only publisher. It does not bind the Manager D1 directly.
// Manager product/image reads go through the private source Worker Service Binding.
export default defineConfig(({ isPreview }) => ({
  worker: {
    name: 'haniel-tryon-publisher-private',
    entrypoint: './src/publisher.mjs',
    compatibilityDate: '2026-11-13',
    workersDev: isPreview,
    observability: { enabled: true, traces: { enabled: true } },
    assets: { runWorkerFirst: ['/*'] },
    env: {
      ASSETS: bindings.assets(),
      SOURCE_API: bindings.worker({
        worker: isPreview ? 'haniel-tryon-catalog-sync-preview' : 'haniel-tryon-catalog-sync',
      }),
      SOURCE_API_SECRET: bindings.secret(),
      LOGIN_LIMITER: bindings.rateLimit({
        namespace: '7311192026',
        simple: { limit: 5, period: 60 },
      }),
      ...(isPreview ? {
        CATALOG_DB: bindings.d1({ name: 'haniel-tryon-public-test' }),
      } : {}),
    },
  },
}));
