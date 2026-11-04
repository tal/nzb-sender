# nzb-sender

Chrome extension (MV3, built with WXT) that adds a **⇩ SAB** button to every result on omgwtfnzbs and sends the NZB straight to SABnzbd.

Releases already completed in SABnzbd show a green **✓ downloaded** badge beside the button, with the completion date on hover. Matches use the job name or original NZB filename, ignoring case, dots, spaces, underscores, and the `.nzb` extension. Different release groups, qualities, and episodes remain separate. Failed or unfinished jobs do not count as downloaded, and sending a job does not mark it completed.

Completed-download names and dates are stored in the extension's local browser storage, separately for each SABnzbd URL/API key. The API key is not copied into the history cache. The initial seed imports current and archived history when the background worker loads with saved settings (or on first use). Each page is saved, so interrupted imports resume. Cached badges appear immediately on subsequent page loads and remain available offline or after jobs are removed from SABnzbd. Only metadata is stored, not NZB files. Clearing the extension's local storage or uninstalling removes this history.

All tabs share one importer: history requests run sequentially, at least one second apart, with a five-minute cooldown persisted across worker restarts. Subsequent updates use SABnzbd's change token to skip unchanged history and scan recent completions with a one-day overlap; a weekly full reconciliation catches edits to older jobs. Refreshes run when the worker starts or pages check the cache, not as a continuously running background schedule. Failures back off from five minutes to one hour and preserve known downloads. During the initial import, unmatched rows show **importing history**; failed refreshes show **history update unavailable**. Use SABnzbd's full API key ([API reference](https://sabnzbd.org/wiki/configuration/5.1/api)).

## Use
- `bun install && bun run build`
- chrome://extensions → Developer mode → Load unpacked → `.output/chrome-mv3`
- For everyday use in Arc/Chrome, load this production folder. `.output/chrome-mv3-dev` requires `bun run dev` to stay running; without it the options page can display while Save and Test connection do nothing. After rebuilding, reload the extension on the browser's extensions page and reopen its options.
- Open the extension options, set the SABnzbd URL and API key, click Test connection. Test runs through the background worker with a real multipart POST, and if SABnzbd redirects (e.g. http → https) it corrects and saves the URL. A failed send shows its reason on the button.

## Layout
| Path | Role |
|---|---|
| `src/entrypoints/content.ts` | Injects buttons, messages the background |
| `src/entrypoints/background.ts` | Does all network calls (no CORS issues) |
| `src/entrypoints/options/` | Settings page |
| `src/lib/sites/` | One adapter per indexer (`omgwtfnzbs.ts`) |
| `src/lib/sabnzbd.ts` | SABnzbd API (`addfile`, `addurl`, connection test) |
| `src/lib/history.ts` | Persistent local download index and throttled SABnzbd importer |

## Send methods
- `addfile` (default): extension downloads the NZB with your logged-in session, uploads it to SAB.
- `addurl`: SAB fetches a URL built from the template. SAB has no cookies, so the template needs your omgwtfnzbs API credentials.

## Firefox / Safari later
- All code uses `browser.*` from `wxt/browser`; no `chrome.*`.
- Firefox: `bunx wxt build -b firefox` (add `browser_specific_settings.gecko.id` in `wxt.config.ts`).
- Safari: `xcrun safari-web-extension-converter .output/chrome-mv3`.
