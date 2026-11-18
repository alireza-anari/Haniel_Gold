import { bindings, defineConfig } from 'cf/config';

export default defineConfig(({ isPreview }) => ({
  worker: {
    name: 'haniel-gold-manager',
    entrypoint: './src/index.js',
    compatibilityDate: '2026-11-13',
    workersDev: true,
    assets: { runWorkerFirst: ['/api/*'] },
    observability: { enabled: true, traces: { enabled: true } },
    env: {
      ASSETS: bindings.assets(),
      // Never bind a Preview to the real accounting database.
      DB: bindings.d1({ name: isPreview ? 'haniel-gold-tryon-test' : 'haniel-gold-db' }),
      // Fail closed even when a Preview URL is shared; turn on only after E2E approval.
      TRYON_PUBLIC_ENABLED: bindings.text('0'),
      BOT_TOKEN: bindings.secret(),
      OWNER_TELEGRAM_ID: bindings.secret()
    }
  }
}));
