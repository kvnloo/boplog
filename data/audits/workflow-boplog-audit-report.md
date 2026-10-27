# boplog public build log — READ-ONLY audit

**Scope:** `/workspace/boplog` (static site + data pipeline + agent surfaces), with child-repo/live-demo impact where advertised from this SSOT.  
**Method:** Verified findings (17) + raw audit sample (84, deduped). Spot-checks reconfirmed on 2026-08-01 workspace state.  
**Canonical site:** https://kvnloo.github.io/boplog/

---

## 1. Executive summary

boplog is a strong **static, machine-readable build archive** (year JSON, hierarchy, agents.md, openapi, Atom, 15‑minute GitHub sync). The biggest failures are not missing product vision — they are **pipeline drift**, **dead advertised surfaces**, and **agent/GEO surfaces that lie by omission or staleness**.

### Critical pattern

| Layer | Intended | Actual |
|--------|----------|--------|
| Tags / GEO | `project-tags.json` → `apply-tags` → domains on year JSON → `build-topics` | Sync rewrites year files **without** tags; CI never runs `geo:build`; `projects-*.json` has **no** `domains`/`languages`/`stack` keys |
| Sitemap | Discover home + developers + **topics/** hubs | `writeSitemap()` hardcodes **7 URLs**; overwrites any topic merge on every sync |
| Live demos | Featured/parallel surfaces work | `demos/room` shell 200 / assets+manifest **404**; `ek.vin` DNS fail; launch Vercel **404** |
| Agent index | `llms.txt` mirrors live FAQ + hubs | FAQ anchors incomplete; **no** topics/taxonomy in Start here; regenerated every sync |
| Client ship | Single build token | `index.html` loads `app.js?v=20260731.9` while meta/CSS/`BUILD_VERSION` are `20260731.15` |

### Severity snapshot (deduped backlog)

| Sev | Count (approx) | Themes |
|-----|----------------|--------|
| **P0** | 6 | GEO pipeline + sitemap; dead room shop + ek.vin; keyboard trap; cache-buster skew |
| **P1** | ~25 | FAQ/schema/llms drift; dead launch; a11y contrast/mode/date; content brand conflicts; weak descriptions; ops gates |
| **P2** | ~25 | OpenAPI thinness; topic meta; child-repo GEO; hierarchy hygiene; motion/layout polish |
| **P3** | ~8 | kbd hint, disclosure grammar, package rename, sitemap priority hygiene |

**Bottom line:** Agents and crawlers are told to trust boplog as SSOT, but the **scheduled sync actively strips GEO tags and topic sitemap entries**, featured parallel surfaces **404**, and several primary project URLs are dead. Fix pipeline + dead links first; then content/schema parity and a11y.

---

## 2. P0 / P1 / P2 / P3 backlog

Effort: **S** ≤ half day, **M** 1–2 days, **L** multi-day / cross-repo.

### P0 — ship blockers / integrity failures

| ID | Issue | Evidence | Recommended action | Effort |
|----|--------|----------|-------------------|--------|
| **P0-1** | **GEO tags not in GitHub sync pipeline**; year JSON lacks `domains`/`languages`/`stack` while topic hubs depend on them | `rg` over `data/projects-*.json`: no domain keys (only incidental “stack” in a description string). `scripts/apply-tags.mjs` stamps from `data/project-tags.json`. `scripts/sync-github.mjs` rewrites year files without tags; no `apply-tags` call. `.github/workflows/sync-github.yml` runs only `node scripts/sync-github.mjs` then `npm run check`; `git add data/ feed.xml llms.txt sitemap.xml` — **not** `topics/`. `package.json`: `"sync"` ≠ `"geo:build"` (`apply-tags && build-topics`). `topics/ai-sdlc.html` still lists stamped projects from an older geo build | Chain **sync → `npm run geo:build` → validate**; commit `topics/` + refreshed sitemap. Prefer stamp tags **inside** sync before `writeYearFiles`, or post-write `apply-tags`. Assert featured/GEO projects retain expected domains in `validate-data.mjs` | **M** |
| **P0-2** | **`sitemap.xml` omits all `topics/*` URLs**; sync overwrites topic merge | Live/local `sitemap.xml` lines 3–9: only `/`, `developers/`, `agents.md`, `llms.txt`, `openapi.json`, `feed.xml`, `data/manifest.json`. `writeSitemap()` hardcodes those seven; `build-topics.mjs` appends topics when run, then next sync drops them. Topic hubs exist and return 200 (e.g. `topics/ai-sdlc.html`) | Make `writeSitemap` the single writer: include `/topics/`, each `data/taxonomy.json` domain hub, sensible lastmod; run after geo build so every 15‑min sync cannot erase discovery | **S** |
| **P0-3** | **Featured surface `demos/room` is dead** (HTML shell, assets + shop manifest 404) | `data/manifest.json` / `data/surfaces.json`: `url` + `shopManifestUrl` → `https://kvnloo.github.io/portfolio/demos/room/` and `.../data/shop-manifest.json`. Live assets/JS and shop data 404; local `portfolio/demos/room/public/data/shop-manifest.json` exists | Redeploy `portfolio/demos/room` so `dist` assets + `public/data` land under Pages path; CI gate that `shopManifestUrl` returns 200; fail closed on `sync-shop-from-boplog` in portfolio CI | **M** (child repo) |
| **P0-4** | **`ek.vin` / metallic-card primary host does not resolve** | `data/audits/link-check.json`: DNS fail for `https://ek.vin/`, `https://ek.vin/ai-eng.pdf`. `data/projects-2026.json` metallic-card `url` = `https://ek.vin/`. Index surfaces card/resume on ek.vin | Restore DNS **or** repoint primary/site/resume to a known-good Pages/Vercel URL; update year files + index links; re-run link-check to 200 | **S–M** (ops + data) |
| **P0-5** | **Activity grids create a multi-hundred keyboard tab trap** | `app.js` `buildActivityGridHtml` emits `<button class="activity__cell">` per day for **both** modes (~364×2). Inactive pane only `pointer-events:none` (still tabbable unless expanded+hidden). No roving tabindex / `role=grid` | One tab stop + arrow roving tabindex; `inert` on inactive page; optionally only focus non-zero days or provide a listbox alternative | **M** |
| **P0-6** | **Asset cache-buster skew: browsers can keep stale `app.js`** | `index.html`: meta/CSS `20260731.15`, script `./app.js?v=20260731.9`. `app.js` `BUILD_VERSION = '20260731.15'`. Same skew reported on live Pages | Single BUILD token injected into HTML script+CSS, `app.js`, topics; CI fails if they diverge | **S** |

### P1 — high impact (agents, a11y, trust, discoverability)

| ID | Issue | Evidence | Recommended action | Effort |
|----|--------|----------|-------------------|--------|
| **P1-1** | FAQPage JSON-LD missing HTML FAQ items + answer text drift | `index.html` HTML FAQ 11 articles incl. `#faq-digital-twin`, `#faq-automation-components`; FAQPage `mainEntity` ~9 Questions; Who-is-Kevin schema has “Code is the great equalizer…” not in matching HTML `<p>` | Single FAQ source (JSON or DOM-first generator) → HTML + JSON-LD 1:1 | **S–M** |
| **P1-2** | `llms.txt` FAQ anchors + product tracks lag live page / hierarchy | `llms.txt` L50–58 only 6 anchors; missing ai-sdlc, tmux-agents, digital-twin, build-log, automation. Product tracks 5 items; FAQ/hierarchy add agent-tooling, boplog. Generator: `sync-github.mjs` `writeLlms()` | Extend `writeLlms()`: full `faq-*` list, topics section, hierarchy/taxonomy/surfaces in Start here | **S** |
| **P1-3** | Home archive/featured empty in static HTML (JS-only) | `#featured-list` / archive filled by `app.js`; live fetch can show loading/empty; noscript → JSON/Atom only | Build-time inject featured + latest N project links during sync; JS remains for filters | **M** |
| **P1-4** | `launch` primary URL 404 on topic hubs | `https://launch-plum-beta.vercel.app/` → 404; `projects-2025.json` + `topics/ai-sdlc.html`, `topics/ai-devtools.html` | Point primary at GitHub (or live deploy); rebuild topics; gate link-check | **S** |
| **P1-5** | Mobile: only mode switch is swipe; pills hidden; swipe meta `aria-hidden` | `styles.css` `@media (max-width: 640px)` `.activity-mode { display: none }`; swipe-meta shown but `aria-hidden`; `bindActivitySwipe` ignores mouse | Keep compact mode control on mobile; do not aria-hide sole alternative | **S** |
| **P1-6** | Commits-mode cells look clickable but are no-ops | Same `<button>` + `cursor:pointer` + hover; click returns early for commits; `selectable:false` only blocks selected style | Non-button / `aria-disabled` + `cursor:default` in commits mode; copy that day filter is build-log only | **S** |
| **P1-7** | Date filter active but invisible in filter panel | `state.date` in filter count/URL; panel has no date chip/control; summary only “N active” | Removable chip `date: YYYY-MM-DD ×`; auto-open disclosure when set | **S** |
| **P1-8** | ace branded “Ace Sports” in boplog vs “LawnTech Dynamics” live | Overrides/FAQ/topics vs `ace` README/title/package/Pages | Pick one public name; align override, FAQ, taxonomy, README, portfolio | **S** |
| **P1-9** | No `og:image` / `twitter:image` | Repo grep empty for `og:image` on boplog | 1200×630 brand card + OG/Twitter image tags on home, developers, topics | **S** |
| **P1-10** | `--faint` text fails WCAG AA contrast | `styles.css` `--faint` on meta/notes/selection/hints; extra opacity on some | Raise faint ≥4.5:1 for real text; reserve true faint for decoration | **S** |
| **P1-11** | Activity density greys under 3:1 non-text contrast; legend `aria-hidden` | Level 0 vs 1 adjacent greys; legend aria-hidden | Stronger steps and/or pattern; accessible scale summary | **S–M** |
| **P1-12** | JS ignores `prefers-reduced-motion` | CSS zeros transitions; `scrollIntoView({ behavior: 'smooth' })` always; track transforms from script | Gate smooth scroll / animate on reduced-motion MQ | **S** |
| **P1-13** | `render()` innerHTML drops keyboard focus | Archive + activity maps fully replaced on filter/day click | Preserve focus by id; surgical DOM updates; restore to trigger control | **M** |
| **P1-14** | Data load failure shows healthy copy | `loadProjects` catch: resultCount “latest 12 shown”; no empty-state/retry | Dedicated error empty + Retry; never claim rows shown | **S** |
| **P1-15** | Home Dataset `dateModified` / build meta lag sync dates | index `2026-07-31` / `20260731.15` vs manifest/llms/sitemap `2026-08-01` | Drive meta + JSON-LD from same `generatedAt` as sync | **S** |
| **P1-16** | Weak / missing description overrides | opcode, cofounder, uiua, raisr commit-noise; `.files` “stay in flow while u code” | Hand overrides for featured + noisy forks | **S** |
| **P1-17** | Featured #1 AudioEngine is 2017 / docs-only signal | `featured.json` repos[0]=AudioEngine; override admits last real work ~2017 | Reorder featured toward active demos (evolve, ace, tmux-agent-fleet, .files, portfolio) | **S** |
| **P1-18** | hierarchy lag: halo, 4dps unlisted; refind misfiled; farm scaffold as world-sim peer | Recent experiments only via `defaultKind`; refind under mobile-legacy; farm scaffold README | Membership lists + reclassify; demote farm or maturity flag | **S–M** |
| **P1-19** | `validate-data` too thin; link-check not gated | Required thin fields only; dead URLs still pass `check` | Enforce domains after tags, hierarchy membership, optional URL health; `check:full` on main/sync | **M** |
| **P1-20** | GitHub API client no 429/403 backoff on `*/15` cron | `sync-github.mjs` throws on !ok; concurrency 8; no Retry-After | Backoff + lower concurrency near quota; fail partial sync without commit | **M** |
| **P1-21** | geo-overnight / geo-benchmark soft-fail | Overnight continues on non-zero check; benchmark exits 0 when unhealthy | Fail fast; no commit on failure; drop `--allow-empty` | **S** |
| **P1-22** | ai-sdlc hub primary cite = tmux-agent-fleet vs evolve everywhere else | taxonomy/FAQ/agents.md say evolve; `build-topics` ranks featured+date → tmux-agent-fleet first | Explicit `primaryProject` per domain (or prefer product id) | **S** |
| **P1-23** | Product-track narrative inconsistent (about / FAQ / Org / llms / hierarchy) | About: zerOS + blueprint system only; FAQ adds blueprint/agent tooling/boplog; Org 5 names; hierarchy many more | `focusProducts` vs full catalog; render all surfaces from hierarchy | **M** |
| **P1-24** | Portfolio hero SWE-Bench 84.8% not claimed on boplog; evolve attributes upstream | Live portfolio vs evolve docs / no SWE-Bench in boplog | Tone portfolio CTA to “upstream Claude Flow / not independent boplog eval” or remove | **S** (child) |
| **P1-25** | Commits cells still `aria-pressed` buttons (related P1-6 / P0-5) | `selectable:false` still builds button + aria-pressed | Non-interactive cells or true disabled semantics | **S** |

### P2 — quality, contracts, polish

| ID | Issue | Evidence | Recommended action | Effort |
|----|--------|----------|-------------------|--------|
| **P2-1** | OpenAPI/README thinner than live Project + missing paths | `openapi.json`: only manifest + year files; no company/kind/product/domains; no hierarchy/taxonomy/surfaces/activity | Expand schemas/paths; README from schema | **M** |
| **P2-2** | Topic meta descriptions truncate mid-URL | `build-topics.mjs` `lead.slice(0, 220)` on long answers | `metaDescription` in taxonomy or word/URL-safe truncate | **S** |
| **P2-3** | developers/ thin head meta | charset/viewport/description/title only | canonical, robots, OG, optional WebPage JSON-LD | **S** |
| **P2-4** | Quote popover: body lowercase flattens Title Case; no Escape/outside dismiss | `body { text-transform: lowercase }`; no `.intro__quote-panel` exception; Escape only clears search | `text-transform: none` on panel; Escape + outside click | **S** |
| **P2-5** | Quote panel mobile placement detached from “i” | ≤520px centers panel; caret at panel center | Anchor under summary or full-width disclosure | **S** |
| **P2-6** | Activity expand hover layout jump | hover/focus expands to 11px GH calendar; shifts filters | Reserve geometry or explicit toggle; respect reduced motion | **M** |
| **P2-7** | Archive rows 641–900px tags crowding | intermediate collapse vs ≤640 grid-areas | Apply cleaner grid earlier | **S** |
| **P2-8** | Full re-render thrash on search keystrokes | `render()` rebuilds archive + both grids every input | Debounce; skip activity rebuild if unchanged; drop is-enter on filter | **M** |
| **P2-9** | Target size 11×11 expanded cells | WCAG 2.5.8 | Larger hitboxes / alternate date control | **M** |
| **P2-10** | `#project-archive` aria-live dumps whole list | list + result-count both polite live | Live only on count/selection | **S** |
| **P2-11** | Thin landmarks / skip past featured | skip → `#archive`; no header | header + section nav; skip main + archive | **S** |
| **P2-12** | Child projects thin GEO (ace SPA, evolve broken Sphinx links, empty `evolve/src/`, zer0 mirrors stub READMEs) | Multiple child repos | llms/robots/sitemap + answer-first heroes; fix evolve links; expand mirror READMEs | **L** |
| **P2-13** | date-overrides only AudioEngine | latest-authored can mislead forks | Audit + document date semantics | **M** |
| **P2-14** | validate / CI missing geo + version + links | `check` = lint + thin validate | `check:full` on main/sync | **M** |
| **P2-15** | llmeo vs geo-benchmark overlap; large run artifacts; dead `#portfolio-filter` ref | dual probe systems; empty run dirs | Consolidate; retention; remove dead refs | **M** |
| **P2-16** | Topic build stamp `YYYYMMDD.geo` ≠ home BUILD | styles desync risk | Shared BUILD_VERSION | **S** |
| **P2-17** | portfolio prebuild swallows sync failure | `|| echo skipped` | Fail closed in CI | **S** |
| **P2-18** | geo-overnight stages scripts/styles + `--allow-empty` | broad `git add` | Tight path allowlist; no empty commits | **S** |
| **P2-19** | manifest duplicates `interactivePortfolio` root + `surfaces` | intentional dual write | Canonical under surfaces; document alias | **S** |
| **P2-20** | metallic-card README v0 boilerplate | GH README “Automatically synced with v0.app” | Real purpose/run/deploy + working URL | **S** |
| **P2-21** | AudioEngine README still PhaseIWireframe URLs | badge/docs mismatch with Pages | Align identity | **S** |
| **P2-22** | Sitemap hourly/0.8 for everything | dilutes crawl signal | Differentiated priority/changefreq + real lastmod | **S** |

### P3 — nice polish

| ID | Issue | Evidence | Action | Effort |
|----|--------|----------|--------|--------|
| **P3-1** | Desktop `/` kbd always visible on touch | no coarse/hover hide | Hide under `(pointer: coarse)` / ≤640 | **S** |
| **P3-2** | Filter vs section disclosure open styles differ | rotate/border vs plain +/− | Shared disclosure component | **S** |
| **P3-3** | Quote “i” 18×18 target | small summary | ≥24px hit area | **S** |
| **P3-4** | developers/ no skip link / shared tokens | bare main | Align shell a11y | **S** |
| **P3-5** | ace package.json name `lawntech-dynamics` | path is ace | Rename package | **S** |
| **P3-6** | Featured/portfolio shop re-sync after override fixes | parallel shop blurbs lag | Re-run shop sync after P1 descriptions | **S** |
| **P3-7** | About vs FAQ product-track scope (same page) | about narrower than FAQ | One sentence from hierarchy | **S** (overlaps P1-23) |

---

## 3. Content & messaging consistency

### Product tracks (fragmented SSOT)

| Surface | What it says |
|---------|----------------|
| About (`index.html` ~L363) | zerOS + blueprint system: health, world sim, evolve |
| FAQ `#faq-product-tracks` + FAQPage schema | Same core **plus** blueprint, agent tooling, boplog |
| Organization schema | zerOS, health, world sim, evolve, blueprint |
| `llms.txt` ## Product tracks | Same five numbered items |
| `data/hierarchy.json` `products[]` | zeros, health, world-sim, evolve, blueprint, **agent-tooling, boplog**, tesla-ui, audioengine, professional-showcase, dotfiles, mobile-legacy, open-source-contrib, … |

**Action spine:** define `focusProducts` (marketing) vs full catalog (data); generate about/FAQ/Org/llms from hierarchy.

### FAQ vs schema vs llms

- HTML: 11 FAQ articles (includes digital twin, automation, ai-sdlc, tmux agents, build-log).
- JSON-LD: 9 Questions; omits digital twin + automation; Who-is-Kevin answer not 1:1 with HTML.
- `llms.txt`: only 6 FAQ anchors; regenerated incomplete by sync.

### Entity / brand conflicts

| Entity | Conflict |
|--------|----------|
| **ace** | boplog: “Ace Sports” digital twin; live https://kvnloo.github.io/ace/ + README/package: **LawnTech Dynamics** |
| **evolve** | Cited as multi-agent framework; empty `src/`, Sphinx hub with known broken anchors |
| **AudioEngine** | Featured #1; override says last real work 2017; README still PhaseIWireframe branding |
| **.files** | Featured #2 blurb slang GH tagline vs rich Hyprland/agent README site |
| **Portfolio SWE-Bench** | Portfolio hero metric; evolve attributes upstream Claude Flow; boplog silent |

### Topic hub primary cite

- Canonical narrative (taxonomy answer, `#faq-ai-sdlc`, `agents.md`): **evolve** first for AI-SDLC.
- `topics/ai-sdlc.html`: list/JSON-LD lead with **tmux-agent-fleet** (featured + newer date scoring in `build-topics.mjs`).

### On-page about vs FAQ

Same page contradicts product-track **scope** (about narrower; FAQ expands “related products”). Low severity alone, but same root as P1-23.

---

## 4. Child repos / live demos

| Surface | Status | Path / URL |
|---------|--------|------------|
| **portfolio demos/room** | **P0 dead** — HTML may load; JS/CSS/data 404; boplog advertises `shopManifestUrl` | https://kvnloo.github.io/portfolio/demos/room/ · https://kvnloo.github.io/portfolio/demos/room/data/shop-manifest.json |
| **ek.vin / metallic-card** | **P0 DNS fail** | https://ek.vin/ · project in `projects-2026.json` |
| **launch** | **P1 404** Vercel | https://launch-plum-beta.vercel.app/ · topics + year file |
| **ace** | Live but brand ≠ boplog copy; SPA thin GEO | https://kvnloo.github.io/ace/ |
| **evolve** | Docs hub; packaging/links weak | https://kvnloo.github.io/evolve/ |
| **tmux-agent-fleet** | README-only citation target | GH only |
| **AudioEngine Pages** | Live docs; identity/README drift | https://kvnloo.github.io/AudioEngine/ |
| **zer0-* / `_pm` mirrors** | Stub READMEs vs rich boplog FAQ claims | GH public mirrors |
| **farm** | Scaffold listed as world-sim peer of ace | hierarchy + README |
| **portfolio shop prebuild** | Soft-fails boplog sync → stale shop risk | `portfolio/demos/room` package prebuild |

**Cross-repo rule:** anything in `surfaces.json` / featured / topic primary `url` should either **200** or **not be the primary cite**.

---

## 5. GEO / SEO & agent surfaces

### Discovery chain (broken links)

```
agents.md Topic discovery → topics/*.html  ✓ live
taxonomy.json domains → hub pages           ✓ files exist
project-tags → domains on year JSON         ✗ stripped after sync
build-topics → topics + sitemap merge       ✗ not in CI; sitemap overwrite
llms.txt Start here → topics/taxonomy       ✗ omitted
sitemap.xml → topics/*                      ✗ 7 URLs only
openapi.json → hierarchy/surfaces/taxonomy  ✗ not documented
```

### Concrete GEO defects

1. **Year API without domains** → topic matching `p.domains.includes(domain.id)` fails on fresh data; committed hubs are **stale snapshots** (`build 20260731.geo` class).
2. **Sitemap** never lists topic hubs (primary extract surfaces).
3. **llms.txt** under-indexes: no topics, incomplete FAQ, thin product tracks, hierarchy only under “Prefer JSON fields”.
4. **FAQPage** incomplete for digital twin / automation intents.
5. **Home SSR gap** — crawlers often never see project names on HTML.
6. **No social images** — weak link previews.
7. **Topic meta** truncates mid-URL.
8. **developers/** indexed in sitemap without canonical/OG.
9. **OpenAPI** markets a thinner API than the site promotes.

### Agent-facing files that *are* good foundations

- `agents.md` topic discovery section (documents hubs).
- `data/hierarchy.json`, `taxonomy.json`, `project-tags.json` as editorial structure.
- `developers/` intent as free static API entry (needs meta polish).
- Atom `feed.xml` + year partitions as durable machine feed.

---

## 6. UX / a11y / motion lab promotion candidates

Candidates to promote into a **dev/lab** or dedicated a11y sprint (not blocking GEO, but high product quality):

| Candidate | Why lab-worthy | Sev |
|-----------|----------------|-----|
| Activity **roving tabindex / inert pane** | Hundreds of tab stops | P0 |
| Commits vs builds **affordance split** | Silent no-op buttons | P1 |
| Mobile **mode switch** always visible to AT | Swipe-only + aria-hidden | P1 |
| **Date chip** in filter chrome | Phantom active filters | P1 |
| **Contrast** pass monochrome faint + activity greys | WCAG AA/non-text | P1 |
| **Reduced motion** JS parity | CSS-only today | P1 |
| **Focus restore** after `innerHTML` render | Keyboard users lose place | P1 |
| Expand-on-hover **layout jump** | Desktop map morph | P2 |
| Search **debounce / partial render** | Blink thrash | P2 |
| Target size / date listbox alternative | 11px cells | P2 |
| Quote overlay case + dismiss | Source fidelity | P2 |
| aria-live on full archive list | Noisy AT | P2 |
| Landmark / skip redesign | Thin map | P2 |

`dev/lab.js` already checks reduced-motion in places — good pattern to lift into `app.js`.

---

## 7. Data pipeline & ops

### Current sync path (every 15 minutes)

```
.github/workflows/sync-github.yml
  → node scripts/sync-github.mjs
  → npm run check          # lint syntax + thin validate-data
  → git add data/ feed.xml llms.txt sitemap.xml
  → commit/push if changed
```

**Missing:** `apply-tags`, `build-topics`, `topics/` commit, version consistency, link health, rate-limit resilience.

### Package scripts (present but unwired to sync)

- `geo:tags` → `apply-tags.mjs`
- `geo:build` → tags + `build-topics.mjs`
- `geo:bench` / overnight loops exist but soft-fail

### Validator gap

`scripts/validate-data.mjs` checks structural project fields (id, name, description, date, url, types, formats, categories, featured). **Does not** catch:

- missing domains after tags  
- hierarchy membership holes  
- sitemap topic presence  
- weak commit-subject descriptions  
- dead primary URLs (`data/audits/link-check.json` offline, ungated)

### Ops risks

| Risk | Detail |
|------|--------|
| Rate limits | No 403/429/Retry-After; concurrency 8; cron `*/15` |
| Soft overnight | Continues / exits 0 on unhealthy scores; broad `git add` |
| Dual surface write | root + `surfaces.interactivePortfolio` identical |
| Artifact bloat | `data/llmeo/runs` large raw benches + empty dirs |
| Child soft-fail | portfolio shop prebuild swallows sync errors |

### Target pipeline (backlog intent, not implementation)

```
sync-github → apply-tags → build-topics → writeSitemap(full) → writeLlms(full)
  → validate-data (incl. domains, hierarchy, sitemap topics)
  → optional link probe for featured/surfaces
  → commit data/ topics/ feed llms sitemap (+ injected index meta if any)
```

---

## 8. Quick wins vs multi-day bets

### Quick wins (≤1 day combined if sequenced)

1. **P0-6** Align `app.js?v=` with `20260731.15` / shared BUILD (**S**).
2. **P0-2** Include topics in `writeSitemap` (**S**).
3. **P1-4 / P0-4** Fix or demote dead primary URLs (launch, ek.vin) (**S**).
4. **P1-2** Expand `writeLlms()` FAQ + Start here topics/taxonomy (**S**).
5. **P1-1** Add missing FAQPage Questions + align Who-is-Kevin text (**S**).
6. **P1-5 / P1-6 / P1-7** Mobile mode control, commits non-button, date chip (**S** each).
7. **P1-10 / P1-12 / P1-14** Contrast bump, reduced-motion JS, load-error state (**S**).
8. **P1-16 / P1-17** `.files` override + featured reorder (**S**).
9. **P1-8** ace naming decision + one override pass (**S**).
10. **P1-9** og:image asset + tags (**S**).
11. **P1-22** `primaryProject: evolve` for ai-sdlc (**S**).
12. Wire **`npm run geo:build`** into workflow + commit `topics/` (**M** but highest leverage).

### Multi-day bets

| Bet | Scope | Why large |
|-----|-------|-----------|
| **GEO pipeline as SSOT** | sync + tags + topics + validate + OpenAPI | Cross-cutting contracts |
| **SSR/static project extract** | inject featured/archive HTML | Crawler + GEO |
| **Activity a11y redesign** | grid pattern, inert, targets, contrast | P0-5 + many P1/P2 |
| **Child surface resurrection** | room deploy, ek.vin, launch, ace brand, evolve packaging | Multi-repo |
| **focusProducts content system** | hierarchy → about/FAQ/llms/Org/schema | Editorial + generators |
| **Quality gates** | link-check, description heuristics, hierarchy membership | CI culture |

### Suggested sequencing

```
Week 0 (trust):  P0-3 room, P0-4 ek.vin, P1-4 launch, P0-6 cache token
Week 1 (GEO):    P0-1 + P0-2 pipeline/sitemap, P1-2 llms, P1-1 FAQ schema, P1-22 primary cite
Week 2 (UX a11y): P0-5 keyboard, P1-5..7, contrast/motion, error state
Week 3 (content): brand alignment, featured order, overrides, hierarchy membership
Week 4 (contracts): OpenAPI/README, check:full, rate-limit, SSR injection
```

---

## 9. Explicit non-goals / things that are already good

### Already good (do not “rebuild”)

- **Static-first architecture** with year-partitioned JSON and manifest is the right agent API shape.
- **Authored-commit filter** and public-only inclusion story is clear and documented.
- **`agents.md`** is a solid human+agent guide (topic discovery section exists; keep it, sync `llms.txt` *to* it).
- **Hierarchy + taxonomy + project-tags** as editorial layer is sound — the bug is **not wiring them into every sync**, not the model itself.
- **Featured ranks** (AudioEngine → … → tmux-agent-fleet) are *internally consistent* with `featured.json`; problem is **editorial quality** of #1 and blurbs, not rank plumbing.
- **Dual pane activity concept** (build-log day filter vs commits density) is intentional; only presentation/a11y is wrong.
- **Lowercase design language** is intentional; quote panel needs a **local** exception, not abandoning the system.
- **15‑minute sync cadence** is fine if API client backs off and GEO post-steps are cheap.
- **`validate-data` + `npm run check`** as a fast path is good; extend, don’t replace with only heavy benches.
- **Parallel portfolio surface** concept (`parallel: true`, shop manifest) is good product design — **deploy is broken**, concept is not.
- **Topic hub set** under `/workspace/boplog/topics/` (ai-sdlc, agent-orchestration, digital-twin, automation, …) is the right GEO surface inventory once pipeline keeps them fresh.

### Explicit non-goals (for this backlog)

- Rewriting the site as a SPA framework or CMS.
- Private monorepo / non-public commit inclusion (contradicts public archive contract).
- Inventing funding/headcount/roadmap claims in agent text.
- Making commits-mode day cells into filters (product decision is filter = build-log only; fix **affordance**, don’t change semantics).
- Perfect parity of every hierarchy product in marketing “tracks” (need focus vs full catalog, not flattening all 13+ into every sentence).
- Turning geo-overnight into the primary CI path (use it for benches; **sync workflow** must be the production GEO path).
- Expanding scope to fix every child repo SEO in one PR — prioritize surfaces **linked as primary cites** from boplog.

---

## Appendix — highest-leverage file map

| Path | Role in defects |
|------|-----------------|
| `.github/workflows/sync-github.yml` | No geo:build; limited git add |
| `scripts/sync-github.mjs` | Year rewrite, writeSitemap, writeLlms |
| `scripts/apply-tags.mjs` | Stamps domains/languages/stack |
| `scripts/build-topics.mjs` | Hubs + sitemap merge + primary ranking |
| `scripts/validate-data.mjs` | Too permissive |
| `data/project-tags.json` | Tag SSOT (unused by sync) |
| `data/taxonomy.json` / `hierarchy.json` | GEO + product narrative |
| `data/manifest.json` / `surfaces.json` | Advertise room shop (404) |
| `sitemap.xml` / `llms.txt` | Under-index topics |
| `openapi.json` / `README.md` | Thin contracts |
| `index.html` / `app.js` / `styles.css` | FAQ schema, cache token, a11y/UX |
| `topics/*.html` | Stale GEO snapshots |
| `data/audits/link-check.json` | Known bad URLs, ungated |

---

**Verified anchors rechecked this pass:** empty `domains` on year JSON; `sitemap.xml` 7 URLs only; script `?v=20260731.9` vs build `20260731.15`; workflow without geo; `llms.txt` thin FAQ/Start here; manifest dual `interactivePortfolio` + 404 shop URL; launch/ek.vin in projects + audits.

*Report is backlog-only; no implementation performed.*