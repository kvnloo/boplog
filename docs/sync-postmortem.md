# Boplog publication recovery, 2026-10-17

## North star

The public build log must reflect **verified public work**, acknowledge limitations,
credit upstream authors, and keep the deployed Pages JSON in sync with its checked-in
source. A passing PR or a newly committed timestamp alone is **not** success.

## Incident timeline

- **2026-08-15:** latest project manifest that remained on `main`.
- **2026-08-25:** latest OSS contribution snapshot that remained on `main`.
- **2026-09-29/30:** draft PR #7 improved project scanning and added portfolio
  evidence/freshness contracts. A smoke run regenerated data in a temporary
  checkout but did not publish it.
- **2026-10-14:** measured collector request usage was **247 core** requests
  for projects and **771 core** for contributions, or **1,018 core** combined.
  Roughly 660 requests came from fetching each merged PR just to read
  `merged_at`. Search had a separate 30/minute bucket and issue queries
  reached its 1,000-result cap.
- **2026-10-17:** repeated PR pushes each reran the full collector, exhausting
  the CI installation's **5,000/hour** budget. A smoke failed at
  `remaining=0` even before listing projects.

## Root causes, not just symptoms

1. **Promotion gap:** the revised collector lived in an unmerged draft.
   Green local tests never changed the live `main` data.
2. **Unbounded history cost:** one REST detail request per merged PR scales
   with lifetime contributions, not new activity.
3. **CI self-interference:** expensive project/OSS syncs executed on every
   PR update. Several quick pushes drained the same installation quota.
4. **Missing publish boundary:** a successful Actions bot commit does not
   trigger the ordinary GitHub Pages branch build. Git data can advance while
   the public site remains stale.
5. **False completion risk:** rate-limit fallbacks could produce partial data
   with a fresh timestamp. GitHub Search also truncates at 1,000 without
   date-partitioning unless the collector explicitly handles it.
6. **No public parity receipt:** the pipeline did not compare deployed
   `data/manifest.json` and `data/oss-contributions.json` against the exact
   generated source revision.

## Permanent changes in PR #7

- Resolve `mergedAt` through paginated GitHub GraphQL, not N REST details.
- Divide capped Search queries into non-overlapping creation-date ranges.
  Mark remaining incomplete/ambiguous evidence honestly.
- Refuse to stamp or publish partial rate-limited project snapshots.
- Keep PR checks offline; reserve network-intensive collection for scheduled,
  main-branch, and explicitly dispatched runs.
- Wait for sufficient GitHub core/GraphQL budget before starting full runs.
- Deploy a Pages artifact directly in the same workflow that regenerates it.
- Check the deployed homepage and both live JSON `generatedAt` values
  against the exact output from that run.
- Feature recent public collaborations, preserving links to their maintainers.

## Acceptance gates

Do not mark the incident closed until all of these have evidence:

- PR #7 merged into `main`; `npm run check` green.
- Full main-branch collector completes without rate-limit abandonment.
- Project manifest and OSS contribution snapshots both advance to a new
  real `generatedAt`, with internally reconciled counts.
- The publishing step succeeds, and live Pages JSON matches those timestamps.
- Two subsequent scheduled sync runs succeed, without rate exhaustion or
  private-repo leakage.
- Any Search limitations are visible in `completeness`; proposed PRs and
  mere fork ownership never masquerade as accepted upstream impact.

## Operating constraints

Prefer the built-in `GITHUB_TOKEN`; do not add a personal PAT just to mask
quadratic collection. Preserve original maintainer credit and actual PR state.
Do not link private repos. Check `Settings → Pages → Source: GitHub Actions`
if artifact deployment is rejected: the available GitHub connector does not
expose Pages source configuration.

A stale-site report should begin by checking **main snapshot timestamp,
last full sync job, Pages deployment job, and live JSON parity** in that order.
Do not respond with another unmerged draft or a local-only success.
