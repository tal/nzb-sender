# Persistent local download history

- Serve downloaded badges from extension-local storage without waiting for SABnzbd.
- Seed completed jobs from current and archived history on worker load; save pages and resume interrupted imports.
- Share one importer across tabs, with sequential requests at least one second apart and a persisted five-minute cooldown.
- Use conditional history requests and incremental recent-completion scans after seeding; reconcile older jobs weekly.
- Back off failed updates up to one hour while retaining known downloads, including jobs later deleted from SABnzbd.
- Keep queued jobs distinct from completed downloads; store names and dates, not NZB files.

Validation: mocked API/storage tests cover persistence, immediate cached replies during a stalled refresh, pagination, request spacing, multi-tab deduplication, restart cooldowns, conditional/incremental updates, failure backoff, interrupted imports, matching and cache isolation. Live SABnzbd latency and browser rendering remain unverified.
