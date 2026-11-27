import { bindings, defineConfig } from 'cf/config';

export default defineConfig({
  worker: {
    name: 'haniel-gold-manager-qa',
    entrypoint: './src/index.js',
    compatibilityDate: '2026-11-13',
    workersDev: true,
    assets: { runWorkerFirst: ['/api/*'] },
    observability: { enabled: true, traces: { enabled: true } },
    env: {
      ASSETS: bindings.assets(),
      DB: bindings.d1({ name: 'haniel-gold-miniapp-qa-20261114' }),
      BOT_TOKEN: bindings.secret(),
      OWNER_TELEGRAM_ID: bindings.secret()
    }
  }
});
