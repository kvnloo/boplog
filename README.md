# boplog

A minimal, static build log for [yohei.me](https://yohei.me), backed by a checked-in snapshot of Yohei Nakajima's public portfolio records.

## What is included

- A compact light-mode interface designed around a dense chronological list.
- One to three featured projects rendered as simple text rows.
- Full-text search plus topic, year, format, and sort filters.
- Shareable URL state for active filters.
- A checked-in JSON snapshot exported from the `Yohei - Portfolio` Airtable.
- No Airtable credential, client-side token, build-time token, or runtime Airtable dependency.
- Data validation that rejects any project not explicitly tagged `public`.
- An evidence-backed contribution ledger with mechanically generated impact totals and original, evidence-linked progress badges.

## Local development

```bash
npm run check
npm run serve
```

Open <http://localhost:4173>.

The site is plain HTML, CSS, and JavaScript. There is no build step and no runtime package dependency.

## Project data

The production site reads [`data/manifest.json`](data/manifest.json), which lists year-partitioned JSON files such as `data/projects-2026.json`. The current snapshot contains 126 public records exported through the connected Airtable account and committed directly to this repository.

Each project supports:

```json
{
  "id": "activegraph",
  "name": "ActiveGraph",
  "description": "...",
  "date": "2026-05-20",
  "url": "https://...",
  "types": ["public", "py"],
  "formats": ["video"],
  "categories": ["ai", "dev"],
  "featured": true,
  "featuredRank": 1
}
```

Set `featured: true` on one to three projects. `featuredRank` controls their order. Optional featured-only fields include `displayName`, `eyebrow`, and `links`.

### Updating the snapshot

No Airtable token setup is required. Data refreshes are explicit repository updates:

1. Read the `Portfolio` table through the connected Airtable account.
2. Export only records whose `Type` includes `public`.
3. Convert them to the normalized project schema and write the year-partitioned JSON files.
4. Preserve featured metadata, update `data/manifest.json`, and run `npm run check`.

This can be performed directly through ChatGPT with the Airtable and GitHub connectors. The JSON files can also be edited by hand for small changes. Private-only Airtable records are never included in the repository or sent to the browser.

## Open-source contribution receipts

[`data/contributions.json`](data/contributions.json) is the canonical public ledger. It separates canonical upstream, contributor-fork, and owned work; records activity independently from accepted impact; and never treats code similarity as attribution. A cherry-pick or adopted commit requires public ancestry, matching patch IDs, maintainer acknowledgement, or explicit PR linkage. Linked PR/adoption records nominate one headline receipt to prevent double counting.

The ledger subject is Kevin Rajan's public identity, [`https://github.com/kvnloo`](https://github.com/kvnloo). Browser scopes are shareable: `?contributions=upstream`, `?contributions=all`, or a comma-separated selection such as `?contributions=selected&communities=hermes,cribble`.

Run `npm run check` after a refresh. The validator recomputes every summary and rejects unsafe URLs, incompatible lifecycle/kind combinations, invalid dispositions, incomplete immutable evidence, linked headline duplication, or hand-maintained totals. Explicit `verified_impact` records survive GitHub refreshes through `mergeGithubRefresh`; refresh receipts must disclose pagination, deduplication, caps, and limitations.

## Deployment

All paths are relative and the site has no server dependency, so it can be deployed directly to GitHub Pages or any static host.
