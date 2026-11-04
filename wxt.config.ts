import { defineConfig } from 'wxt';

// Chrome (MV3) only for now. To target Firefox/Safari later:
//   wxt build -b firefox            (add browser_specific_settings.gecko.id below)
//   xcrun safari-web-extension-converter .output/chrome-mv3
// All code uses `browser.*` from wxt/browser, which is polyfilled for every target.
export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'NZB Sender',
    icons: {
      16: '/icon/16.png',
      32: '/icon/32.png',
      48: '/icon/48.png',
      128: '/icon/128.png',
    },
    description: 'Adds a one-click "send to SABnzbd" button on omgwtfnzbs.',
    permissions: ['storage'],
    host_permissions: ['*://omgwtfnzbs.org/*', '*://*.omgwtfnzbs.org/*'],
    // SABnzbd host is user-defined; requested at runtime from the options page.
    optional_host_permissions: ['*://*/*'],
  },
});
