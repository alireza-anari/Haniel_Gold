import {bindings,defineConfig} from 'cf/config';
// Internal scheduled Worker. Not for Telegram, not customer-facing.
// SYNC_ENABLED=0 until owner approves the preview sync test.
export default defineConfig(({isPreview})=>({
 worker:{
  name:'haniel-tryon-catalog-sync',
  entrypoint:'./src/index.js',
  compatibilityDate:'2026-11-13',
  workersDev:false,
  env:{
   SOURCE_DB:bindings.d1({name:isPreview?'haniel-gold-tryon-test':'haniel-gold-db'}),
   CATALOG_DB:bindings.d1({name:isPreview?'haniel-gold-tryon-test':'haniel-tryon-public'}),
   SYNC_ENABLED:bindings.text('0')
  }
 }
}));
