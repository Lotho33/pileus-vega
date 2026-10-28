// Loads Amazon's patched Shaka build (src/vendor/shaka, scripts/fetch-shaka.sh)
// and the browser polyfills it expects. Done lazily, the first time a HLS
// stream plays: the polyfills replace globals such as `document`, `window.fetch`
// and `navigator.userAgent`, which nothing else in the app should see earlier.

/* eslint-disable @typescript-eslint/no-var-requires */

let shaka: any = null;

export function loadShaka(): any {
  if (shaka) {
    return shaka;
  }
  require('../vendor/shaka/polyfills/DocumentPolyfill').default.install();
  require('../vendor/shaka/polyfills/ElementPolyfill').default.install();
  // Not TextDecoderPolyfill: core/polyfills already installs a decoder that
  // takes ArrayBuffers too, and gRPC decoding shares that global.
  require('../vendor/shaka/polyfills/W3CMediaPolyfill').default.install();
  require('../vendor/shaka/polyfills/MiscPolyfill').default.install();
  require('../vendor/shaka/polyfills/DOMParserPolyfill').default.install();
  const mod = require('../vendor/shaka/shaka-player.compiled.js');
  shaka = mod.default ?? mod;
  shaka.polyfill.installAll();
  // Plain fetch for segments and playlists (the build's own patch avoids
  // ReadableStream, which Hermes on Vega lacks).
  for (const scheme of ['http', 'https']) {
    shaka.net.NetworkingEngine.unregisterScheme(scheme);
    shaka.net.NetworkingEngine.registerScheme(
      scheme,
      shaka.net.HttpFetchPlugin.parse,
      shaka.net.NetworkingEngine.PluginPriority.APPLICATION,
      true,
    );
  }
  return shaka;
}
