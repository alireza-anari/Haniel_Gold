import { bindings, defineConfig } from 'cf/config';

// Dedicated owner-only publisher. It is independent from both Telegram Manager and customer Worker.
// Preview receives only the separate public catalog; SOURCE_DB is deliberately not bound.
export default defineConfig(({ isPreview }) => ({
  worker: {
    name: 'haniel-tryon-publisher-private',
    entrypoint: './src/publisher.mjs',
    compatibilityDate: '2026-11-13',
    workersDev: isPreview,
    assets: { runWorkerFirst: ['/*'] },
    env: {
      ASSETS: bindings.assets(),
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
