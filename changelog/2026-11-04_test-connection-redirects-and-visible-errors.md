# Test connection mirrors a real send; errors are visible

## Why
- User's sends failed ("✗ failed", nothing in SABnzbd) while **Test connection** said ✓.
- Root cause found: the saved URL was `http://sab.tal.by`; Caddy answers it with a **308 to https**. The redirect response carries no CORS headers, only SABnzbd's final HTTPS response sends `access-control-allow-origin: *`.
- Test used two tiny GETs from the options page and never exercised what a send does (service worker, multipart POST, redirect), so it could pass while sends failed.
- Host permission was requested only for the typed origin (`http://…`), never the https redirect target.

## Changes
| Area | Change |
|---|---|
| `src/lib/sabnzbd.ts` | `testConnection` now: GET version → detect redirect → GET queue (API key) → multipart POST `mode=version`. Returns `{ version, baseUrl, redirect }` |
| `src/lib/sabnzbd.ts` | New `resolveBaseUrl`: accepts scheme/port/path changes on the same host only; a redirect to another host (login portal) or a non-`/api` path is an explicit error |
| `src/lib/sabnzbd.ts` | New `reach()` wrapper: network failures read `Uploading NZB to SABnzbd: could not reach https://… (Failed to fetch)` instead of a bare "Failed to fetch" |
| `src/lib/messages.ts`, `background.ts` | New `test-connection` message; Test runs in the background worker with the unsaved form values |
| `src/entrypoints/options/main.ts` | Requests host permission for both http and https of the host; on `redirect: 'followed'` rewrites the URL field, requests permission for it, and saves |
| `src/entrypoints/content.ts` | Failed button shows the reason (`✗ <first 48 chars>`), full text in the tooltip |
| `src/lib/__tests__/test-connection.test.ts` | 9 tests: redirect resolution, wrong API key, rejected POST, named network failure |

## Learned / corrected
- My first theory (unsaved settings after Test) was wrong: Test never saved, but the user had also pressed Save.
- Not reproducible with `curl`: 50-400 KB POSTs to the http URL all got a clean 308 (no resets), so size was not the cause.
- Still unexplained: in one browser session rows 3-11 sent fine while rows 0-2 failed with "Failed to fetch" under the same saved settings. The user changed the URL around then, so settings may have changed mid-test.
- The browser I control (Claude in Chrome) is a separate window/profile; its tabs are invisible to the user.
- omgwtfnzbs's front-page policy forbids AI agents on accounts; the user explicitly chose to proceed with browser tests anyway.
- Working tree also contained unrelated uncommitted work (history badges, `tsconfig` `types: ["bun"]`) that was left untouched.

## Verified
- `bun test`: 14 pass; `bun run compile`: clean; dev server hot-reloaded the extension.
- Not yet verified: Test against the real `http://sab.tal.by` setup from the user's browser.
