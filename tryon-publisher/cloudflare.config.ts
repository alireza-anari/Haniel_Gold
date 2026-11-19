import {bindings,defineConfig} from 'cf/config';
// Separate OWNER-ONLY publisher, not customer or manager. No production bindings or URL.
// Preview intentionally has no SOURCE_DB until read-only access security is approved.
export default defineConfig(({isPreview})=>({
 worker:{
  name:'haniel-tryon-publisher-private',
  entrypoint:'./src/publisher.mjs',
  compatibilityDate:'2026-11-13',
  workersDev:false,
  assets:{runWorkerFirst:['/*']},
  env:{
   ASSETS:bindings.assets(),
   ...(isPreview?{CATALOG_DB:bindings.d1({name:'haniel-tryon-public-test'})}:{}),
  }
 }
}));
