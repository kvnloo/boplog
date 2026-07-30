# boplog

A minimal, static build log for [Kevin Rajan](https://github.com/kvnloo) (`kvnloo`), backed by a checked-in snapshot of **public GitHub repositories he has committed to**.

Live (after Pages is enabled): <https://kvnloo.github.io/boplog/>

## What is included

- Compact light-mode UI: featured rows, search, topic/year/format/sort filters, activity heatmap.
- Shareable URL state for active filters.
- Snapshot data under `data/`, regenerated from the GitHub API.
- **No personal API key** in the browser or in secrets — GitHub Actions uses the built-in `GITHUB_TOKEN`.
- Filter rule: include a repo only if `kvnloo` authored at least one commit (archive-only forks are dropped).
- Free CLI (`boplog`), local MCP server, OpenAPI, and agent discovery docs.

## Local development

```bash
npm run sync    # needs GITHUB_TOKEN or `gh auth login`
npm run check
npm run serve
```

Open <http://localhost:4173>.

## Automatic sync

[`.github/workflows/sync-github.yml`](.github/workflows/sync-github.yml) runs:

- every **15 minutes** (`cron: '*/15 * * * *'`)
- on manual `workflow_dispatch`

Each run:

1. Lists public repos owned by `kvnloo`
2. Keeps originals + forks **only if** you authored commits
3. Writes `data/projects-YYYY.json`, `data/manifest.json`, `feed.xml`, `llms.txt`, `sitemap.xml`
4. Validates, then commits + pushes if anything changed

Rate limit budget: Actions `GITHUB_TOKEN` allows **1,000 req/hour** for this repo. A full authorship pass over ~360 repos is a few hundred calls — fine at 15‑minute cadence, especially with concurrency and skips for empty/error forks.

## Project data shape

```json
{
  "id": "cod",
  "name": "cod",
  "description": "...",
  "date": "2026-07-29",
  "url": "https://github.com/kvnloo/cod",
  "types": ["public"],
  "formats": [],
  "categories": ["dev"],
  "featured": true,
  "featuredRank": 1
}
```

Featured projects (1–3) are chosen automatically by stars, then recency.

## Deployment

Enable **GitHub Pages** for this repo (Settings → Pages → Deploy from branch `main` / root, or GitHub Actions). Paths are relative so project Pages at `/boplog/` work.

## License

See [LICENSE](LICENSE).
