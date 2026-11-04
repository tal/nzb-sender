# Initial extension scaffold

- New project `nzb-sender`: WXT + TypeScript + Bun, Chrome MV3 target
- Content script adds a "⇩ SAB" button after each `send?id=` link on omgwtfnzbs result rows
- Background worker sends to SABnzbd (`addfile` default, `addurl` optional)
- Options page: URL, API key, method, category (page / custom / none), priority, test button
- Site logic isolated in `src/lib/sites/` for future indexers

## Learned from the sample page
- Rows are `tr.nzbt_row`; release id/name come from `input[name="check[]"]` (`value`, `rlsname`)
- Each row has an HTML comment `<sabcategory>tv</sabcategory>`, used as the SAB category
- The site's own download link is `/send?id=ID` (needs cookies), so `addurl` alone cannot work without credentials in the URL; hence `addfile` is the default
- Selectors verified against the live site: 50 rows, ids/names/categories parsed

## Not yet verified
- Real end-to-end send to SABnzbd (needs the unpacked extension loaded and a SAB API key)
- What `/send?id=` returns (NZB vs redirect); not fetched to avoid burning a grab
