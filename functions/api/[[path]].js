/* Cloudflare-native API. Pages Functions + D1 + optional R2.
   Django proxy intentionally retired for all-Cloudflare staging. */
import { handle } from '../_lib/cloudflare-api.js';
export const onRequest = handle;
