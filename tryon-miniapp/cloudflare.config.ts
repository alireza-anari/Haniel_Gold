import { bindings, defineConfig } from 'cf/config';

// This Worker is independent from the private Telegram Manager.
// Before launch, Production has NO database binding and its public API is disabled.
// Only Preview binds the separate customer test catalog, NEVER the Manager D1.
export default defineConfig(({ isPreview }) => ({
  worker: {
    name: 'haniel-gold-tryon',
    entrypoint: './src/index.js',
    compatibilityDate: '2026-11-13',
    observability: { enabled: true, traces: { enabled: true } },
    workersDev: true,
    assets: { runWorkerFirst: ['/api/*'] },
    env: {
      ASSETS: bindings.assets(),
      ...(isPreview ? { CATALOG_DB: bindings.d1({ name: 'haniel-tryon-public-test' }) } : {}),
      TRYON_PUBLIC_ENABLED: bindings.text(isPreview ? '1' : '0')
    }
  }
}));
