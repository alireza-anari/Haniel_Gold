/* HANI-EL GOLD dedicated Cloudflare Worker for scheduled Servix sync.
   Deploy separately from Pages, bind the SAME D1 database as Pages.
   No public fetch API and no hardcoded keys. */
import { syncRate } from '../functions/_lib/gold-market.js';

export default {
  fetch() {
    return new Response('Not Found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil((async () => {
      const result = await syncRate(env);
      // No API key, market price or PII in logs.
      console.log('haniel_gold_rate_sync', result.status);
    })().catch(error => {
      console.error('haniel_gold_rate_sync_failed', error?.code || 'WORKER_ERROR');
    }));
  }
};
