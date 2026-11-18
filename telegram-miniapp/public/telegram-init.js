/* Read only the signed Telegram Mini App launch token.
 * Never persist, log, display, or accept initDataUnsafe as authentication.
 * The Worker MUST still validate the HMAC against the preview bot token. */
(function (global) {
  'use strict';
  function readRawInitData(webApp, href) {
    const sdk = webApp?.initData;
    if (typeof sdk === 'string' && sdk.length > 0) return sdk;
    let url;
    try { url = new URL(href); } catch { return ''; }
    // Telegram places tgWebAppData in the URL fragment in some clients.
    // The API's HMAC verification applies even if data is obtained here.
    for (const raw of [url.hash.replace(/^#/, ''), url.search.replace(/^\?/, '')]) {
      const candidate = raw.includes('?') ? raw.substring(raw.indexOf('?') + 1) : raw;
      const token = new URLSearchParams(candidate).get('tgWebAppData');
      if (token) return token;
    }
    return '';
  }
  global.HanielTelegramInit = Object.freeze({ readRawInitData });
})(window);
