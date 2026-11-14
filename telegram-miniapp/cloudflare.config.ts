import { bindings, defineConfig } from 'cf/config';

export default defineConfig({
  worker: {
    name: 'haniel-gold-manager',
    entrypoint: './src/index.js',
    compatibilityDate: '2026-11-13',
    workersDev: true,
    assets: { runWorkerFirst: ['/api/*'] },
    observability: { enabled: true, traces: { enabled: true } },
    env: {
      ASSETS: bindings.assets(),
      DB: bindings.d1({ name: 'haniel-gold-db' }),
      BOT_TOKEN: bindings.secret(),
      OWNER_TELEGRAM_ID: bindings.secret()
    }
  }
});
