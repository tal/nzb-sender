# nzb-sender

Chrome extension (MV3, built with WXT) that adds a **⇩ SAB** button to every result on omgwtfnzbs and sends the NZB straight to SABnzbd.

## Use
- `bun install && bun run build`
- chrome://extensions → Developer mode → Load unpacked → `.output/chrome-mv3`
- Open the extension options, set the SABnzbd URL and API key, click Test connection.

## Layout
| Path | Role |
|---|---|
| `src/entrypoints/content.ts` | Injects buttons, messages the background |
| `src/entrypoints/background.ts` | Does all network calls (no CORS issues) |
| `src/entrypoints/options/` | Settings page |
| `src/lib/sites/` | One adapter per indexer (`omgwtfnzbs.ts`) |
| `src/lib/sabnzbd.ts` | SABnzbd API (`addfile`, `addurl`, version/queue test) |

## Send methods
- `addfile` (default): extension downloads the NZB with your logged-in session, uploads it to SAB.
- `addurl`: SAB fetches a URL built from the template. SAB has no cookies, so the template needs your omgwtfnzbs API credentials.

## Firefox / Safari later
- All code uses `browser.*` from `wxt/browser`; no `chrome.*`.
- Firefox: `bunx wxt build -b firefox` (add `browser_specific_settings.gecko.id` in `wxt.config.ts`).
- Safari: `xcrun safari-web-extension-converter .output/chrome-mv3`.
