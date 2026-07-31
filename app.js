(() => {
  'use strict';

  const BUILD_VERSION = '20260731.5';
  const DATA_ROOT = new URL('./data/', document.baseURI);
  const THEME_KEY = 'boplog-theme';
  const ACTIVITY_MODE_KEY = 'boplog-activity-mode';
  const ACTIVITY_WEEKS = 52;
  const ACTIVITY_PAGE = { builds: 0, commits: 1 };
  document.documentElement.dataset.build = BUILD_VERSION;

  /** Project ids that also appear as props in the interactive shop (portfolio demos/room). */
  const SHOP_PROJECT_IDS = new Set([
    'evolve',
    'ace',
    'files',
    'tmux-agent-fleet',
    'audioengine',
    'monument',
    'portfolio',
  ]);

  const state = {
    projects: [],
    hierarchy: null,
    surfaces: null,
    activity: null,
    activityMode: 'builds',
    query: '',
    kind: '',
    portfolio: '', // alias of kind (legacy urls)
    product: '',
    category: '',
    format: '',
    year: '',
    date: '',
    sort: 'newest',
  };

  const elements = {
    featuredList: document.querySelector('#featured-list'),
    archive: document.querySelector('#project-archive'),
    resultCount: document.querySelector('#result-count'),
    archiveSummary: document.querySelector('#archive-summary'),
    focusProducts: document.querySelector('#focus-products'),
    search: document.querySelector('#project-search'),
    kind: document.querySelector('#kind-filter'),
    portfolio: document.querySelector('#portfolio-filter'),
    product: document.querySelector('#product-filter'),
    category: document.querySelector('#category-filter'),
    year: document.querySelector('#year-filter'),
    format: document.querySelector('#format-filter'),
    sort: document.querySelector('#sort-filter'),
    clearFilters: document.querySelector('#clear-filters'),
    randomBuild: document.querySelector('#random-build'),
    emptyState: document.querySelector('#empty-state'),
    currentYear: document.querySelector('#current-year'),
    filterDisclosure: document.querySelector('#filter-disclosure'),
    filterSummary: document.querySelector('#filter-summary'),
    activityViewport: document.querySelector('#activity-viewport'),
    activityTrack: document.querySelector('#activity-track'),
    activityMapBuilds: document.querySelector('#activity-map-builds'),
    activityMapCommits: document.querySelector('#activity-map-commits'),
    activityPageBuilds: document.querySelector('#activity-page-builds'),
    activityPageCommits: document.querySelector('#activity-page-commits'),
    activitySelection: document.querySelector('#activity-selection'),
    activityNote: document.querySelector('#activity-note'),
    activityModeBuilds: document.querySelector('#activity-mode-builds'),
    activityModeCommits: document.querySelector('#activity-mode-commits'),
    activityModeLabel: document.querySelector('#activity-mode-label'),
    activityModeNext: document.querySelector('#activity-mode-next'),
    activitySwipeHint: document.querySelector('#activity-swipe-hint'),
    themeToggle: document.querySelector('#theme-toggle'),
  };

  const categoryLabels = {
    ai: 'ai',
    dev: 'dev',
    vc: 'vc',
    art: 'art',
    econ: 'econ',
    'no code': 'no-code',
    web3: 'web3',
  };

  const escapeHtml = (value = '') => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const normalize = (value = '') => String(value).trim().toLowerCase();
  const labelForCategory = (category) => categoryLabels[category] || category;
  const sortUnique = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));

  /**
   * All-lowercase site still needs readable multi-word identifiers.
   * Split camelCase / PascalCase on boundaries with a middle dot:
   *   AudioEngine → Audio·Engine  (CSS lowercases to audio·engine)
   * Existing hyphens stay: tmux-agent-fleet → tmux-agent-fleet
   * Trademark exception: zerOS keeps OS caps (wrap with .tm-case in HTML).
   */
  function isZerOSLabel(value = '') {
    const s = String(value).trim();
    return /^zer\s*os$/i.test(s) || /^zeros$/i.test(s) || s === 'zerOS';
  }

  function softLabel(value = '') {
    const raw = String(value);
    if (!raw) return '';
    if (isZerOSLabel(raw)) return 'zerOS';
    // Keep leading . / _ (e.g. .files, _pm)
    const lead = raw.match(/^[._]+/)?.[0] || '';
    let body = lead ? raw.slice(lead.length) : raw;
    // iOS reads fine as "ios" in all-lowercase — don't split to i·os.
    const protectedTokens = [];
    body = body.replace(/iOS/gi, (match) => {
      const key = `\0${protectedTokens.length}\0`;
      protectedTokens.push(match);
      return key;
    });
    // Only split camel/Pascal boundaries — leave digits glued (zer0, …).
    let split = body
      .replace(/([a-z])([A-Z])/g, '$1·$2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1·$2');
    split = split.replace(/\0(\d+)\0/g, (_, i) => protectedTokens[Number(i)]);
    // Always emit lowercase so labels never depend on CSS alone (filters, aria, etc.).
    return (lead + split).toLowerCase();
  }

  /** Escape for HTML; trademark labels keep OS caps via .tm-case. */
  function htmlSoftLabel(value = '') {
    const text = softLabel(value);
    if (isZerOSLabel(value) || text === 'zerOS') {
      return `<span class="tm-case">${escapeHtml('zerOS')}</span>`;
    }
    return escapeHtml(text);
  }

  function projectLabel(project) {
    return softLabel(project.displayName || project.name || '');
  }

  function getTheme() {
    return document.documentElement.dataset.theme === 'night' ? 'night' : 'day';
  }

  function setTheme(theme) {
    const next = theme === 'night' ? 'night' : 'day';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch (_) { /* ignore */ }
    if (elements.themeToggle) {
      elements.themeToggle.setAttribute('aria-pressed', next === 'night' ? 'true' : 'false');
      elements.themeToggle.title = next === 'night' ? 'Switch to day' : 'Switch to night';
    }
  }

  function projectSearchText(project) {
    return normalize([
      project.name,
      project.displayName,
      project.description,
      project.companyName,
      project.kindName,
      project.kind,
      project.portfolioName,
      project.productName,
      project.portfolio,
      project.product,
      ...(project.categories || []),
      ...(project.formats || []),
      ...(project.types || []),
    ].join(' '));
  }

  function hierarchyPath(project) {
    const company = project.companyName || project.company || 'zer0';
    const kind = project.kindName || project.kind || project.portfolioName || project.portfolio || '';
    const product = project.productName || project.product || '';
    return { company, kind, product };
  }

  function renderHierarchyPath(project, { interactive = true } = {}) {
    const { company, kind, product } = hierarchyPath(project);
    if (!kind && !product) return '';
    const parts = [];
    parts.push(`<span>${escapeHtml(company)}</span>`);
    if (kind) {
      parts.push('<span class="sep">/</span>');
      const kindValue = project.kind || project.portfolio || '';
      if (interactive) {
        parts.push(`<button type="button" data-filter-kind="kind" data-filter-value="${escapeHtml(kindValue)}">${htmlSoftLabel(kind)}</button>`);
      } else {
        parts.push(`<span>${htmlSoftLabel(kind)}</span>`);
      }
    }
    if (product && (project.kind || project.portfolio) !== 'experiment') {
      parts.push('<span class="sep">/</span>');
      if (interactive) {
        parts.push(`<button type="button" data-filter-kind="product" data-filter-value="${escapeHtml(project.product || '')}">${htmlSoftLabel(product)}</button>`);
      } else {
        parts.push(`<span>${htmlSoftLabel(product)}</span>`);
      }
    }
    return `<div class="project-row__path">${parts.join('')}</div>`;
  }

  function projectKind(project) {
    return project.kind || project.portfolio || '';
  }

  function getFilteredProjects() {
    const query = normalize(state.query);
    const kindFilter = effectiveKind();
    const filtered = state.projects.filter((project) => {
      if (query && !projectSearchText(project).includes(query)) return false;
      if (kindFilter && projectKind(project) !== kindFilter) return false;
      if (state.product && project.product !== state.product) return false;
      if (state.category && !(project.categories || []).includes(state.category)) return false;
      if (state.format && !(project.formats || []).includes(state.format)) return false;
      if (state.year && !project.date.startsWith(state.year)) return false;
      if (state.date && project.date !== state.date) return false;
      return true;
    });

    return filtered.sort((a, b) => {
      if (state.sort === 'oldest') return a.date.localeCompare(b.date);
      if (state.sort === 'az') return (a.displayName || a.name).localeCompare(b.displayName || b.name);
      return b.date.localeCompare(a.date);
    });
  }

  function renderFeatured() {
    const featured = state.projects
      .filter((project) => project.featured)
      .sort((a, b) => (a.featuredRank || 99) - (b.featuredRank || 99))
      .slice(0, 12);

    elements.featuredList.dataset.count = String(featured.length);
    elements.featuredList.innerHTML = featured.map((project, index) => {
      const name = projectLabel(project);
      const links = Array.isArray(project.links) && project.links.length
        ? project.links
        : [{ label: 'open', url: project.url }];
      const eyebrow = project.eyebrow ? `<span>${escapeHtml(project.eyebrow)}</span>` : '';
      const linkHtml = links.map((link) => (
        `<a href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer">${escapeHtml(link.label)} ↗</a>`
      )).join('');
      const shopUrl = shopUrlFor(project);
      const shopLink = shopUrl
        ? `<a href="${escapeHtml(shopUrl)}" target="_blank" rel="noreferrer" title="View as interactive shop prop">shop ↗</a>`
        : '';
      const path = renderHierarchyPath(project, { interactive: false }).replace('project-row__path', 'featured-item__path');

      return `
        <article class="featured-item">
          <div class="featured-item__index">${String(index + 1).padStart(2, '0')}</div>
          <div class="featured-item__body">
            <div class="featured-item__line">
              <h3><a href="${escapeHtml(project.url)}" target="_blank" rel="noreferrer">${escapeHtml(name)}</a></h3>
              <time datetime="${escapeHtml(project.date)}">${escapeHtml(project.date)}</time>
            </div>
            <p>${escapeHtml(project.description)}</p>
            ${path}
            <div class="featured-item__meta">${eyebrow}${linkHtml}${shopLink}</div>
          </div>
        </article>`;
    }).join('');
  }

  function isoDate(date) {
    return date.toISOString().slice(0, 10);
  }

  function localDateLabel(value) {
    const date = new Date(`${value}T12:00:00Z`);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(date);
  }

  function activityLevel(count, maxCount) {
    if (!count) return 0;
    if (maxCount <= 1) return 2;
    return Math.min(4, Math.max(1, Math.ceil((count / maxCount) * 4)));
  }

  function buildLogCounts() {
    const counts = new Map();
    for (const project of state.projects) {
      counts.set(project.date, (counts.get(project.date) || 0) + 1);
    }
    return counts;
  }

  function commitCounts() {
    const counts = new Map();
    const source = state.activity?.commits || state.activity?.days || {};
    for (const [day, count] of Object.entries(source)) {
      const n = Number(count) || 0;
      if (n > 0) counts.set(day, n);
    }
    return counts;
  }

  function activityPageIndex(mode = state.activityMode) {
    return mode === 'commits' ? ACTIVITY_PAGE.commits : ACTIVITY_PAGE.builds;
  }

  /** Slide the dual-page track to a page index. dragPx follows the finger during swipe. */
  function setActivityTrackPosition(pageIndex, { dragPx = 0, animate = true } = {}) {
    const track = elements.activityTrack;
    const viewport = elements.activityViewport;
    if (!track || !viewport) return;
    const width = viewport.clientWidth || 1;
    const page = pageIndex === 1 ? 1 : 0;
    const x = (-page * width) + dragPx;
    track.classList.toggle('is-dragging', !animate);
    track.style.transform = `translate3d(${x}px, 0, 0)`;
    track.dataset.page = String(page);
  }

  function setActivityMode(mode, { animate = false } = {}) {
    const next = mode === 'commits' ? 'commits' : 'builds';
    const changed = next !== state.activityMode;
    state.activityMode = next;
    try { localStorage.setItem(ACTIVITY_MODE_KEY, next); } catch (_) { /* ignore */ }

    elements.activityModeBuilds?.classList.toggle('is-active', next === 'builds');
    elements.activityModeCommits?.classList.toggle('is-active', next === 'commits');
    elements.activityModeBuilds?.setAttribute('aria-pressed', next === 'builds' ? 'true' : 'false');
    elements.activityModeCommits?.setAttribute('aria-pressed', next === 'commits' ? 'true' : 'false');

    elements.activityPageBuilds?.classList.toggle('is-active', next === 'builds');
    elements.activityPageCommits?.classList.toggle('is-active', next === 'commits');

    // Mobile: current mode up top; under graph: →/← other mode + "swipe".
    if (elements.activityModeLabel) {
      elements.activityModeLabel.textContent = next === 'commits' ? 'all commits' : 'build log';
    }
    if (elements.activityModeNext) {
      // Arrow points toward the mode you swipe into.
      elements.activityModeNext.textContent = next === 'commits' ? '← build log' : '→ commits';
    }
    if (elements.activitySwipeHint) {
      elements.activitySwipeHint.textContent = 'swipe';
    }

    const root = document.querySelector('.activity');
    if (root) root.dataset.mode = next;

    if (elements.activityNote) {
      elements.activityNote.textContent = next === 'commits'
        ? 'All-commits mode uses your GitHub contribution calendar snapshot (profile green squares), not only rows on this site.'
        : 'Build-log mode counts only entries published on this website — not every git commit.';
    }

    // Day click filters the archive only for build-log entries.
    if (next === 'commits' && state.date) {
      state.date = '';
    }

    // Pane scroll: builds | commits
    if (changed || animate) {
      setActivityTrackPosition(activityPageIndex(next), { animate: Boolean(animate && changed) });
    } else {
      setActivityTrackPosition(activityPageIndex(next), { animate: false });
    }
  }

  function activityWindowRange() {
    const builds = buildLogCounts();
    const commits = commitCounts();
    const today = new Date();
    today.setUTCHours(12, 0, 0, 0);
    const latestFromCounts = [...builds.keys(), ...commits.keys()].sort().at(-1);
    const latestProject = [...state.projects].sort((a, b) => b.date.localeCompare(a.date))[0];
    const latestDate = latestFromCounts
      ? new Date(`${latestFromCounts}T12:00:00Z`)
      : (latestProject ? new Date(`${latestProject.date}T12:00:00Z`) : today);
    const end = latestDate > today ? new Date(latestDate) : new Date(today);
    end.setUTCDate(end.getUTCDate() + (6 - end.getUTCDay()));
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - (ACTIVITY_WEEKS * 7 - 1));
    return { start, end, builds, commits };
  }

  function buildActivityGridHtml(counts, { mode, unit, units, selectable }) {
    const { start } = activityWindowRange();
    const maxCount = Math.max(1, ...counts.values(), 0);
    const weeks = [];
    const monthLabels = [];
    let previousMonth = -1;
    let activeDays = 0;

    for (let week = 0; week < ACTIVITY_WEEKS; week += 1) {
      const days = [];
      const weekStart = new Date(start);
      weekStart.setUTCDate(start.getUTCDate() + week * 7);
      const month = weekStart.getUTCMonth();
      if (month !== previousMonth) {
        monthLabels.push(`<span style="grid-column:${week + 1}">${weekStart.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })}</span>`);
        previousMonth = month;
      }
      for (let day = 0; day < 7; day += 1) {
        const date = new Date(weekStart);
        date.setUTCDate(weekStart.getUTCDate() + day);
        const value = isoDate(date);
        const count = counts.get(value) || 0;
        if (count) activeDays += 1;
        const selected = selectable && value === state.date;
        const label = `${count} ${count === 1 ? unit : units} on ${localDateLabel(value)}`;
        days.push(
          `<button class="activity__cell${selected ? ' is-selected' : ''}" type="button" data-activity-date="${value}" data-activity-mode="${mode}" data-level="${activityLevel(count, maxCount)}" aria-pressed="${selected ? 'true' : 'false'}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"></button>`,
        );
      }
      weeks.push(`<div class="activity__week">${days.join('')}</div>`);
    }

    return {
      activeDays,
      html: `
      <div class="activity__months" aria-hidden="true">${monthLabels.join('')}</div>
      <div class="activity__days" aria-hidden="true"><span>Mon</span><span>Wed</span><span>Fri</span></div>
      <div class="activity__weeks">${weeks.join('')}</div>`,
    };
  }

  function updateActivitySelectionStats() {
    if (!elements.activitySelection) return;
    const mode = state.activityMode === 'commits' ? 'commits' : 'builds';
    if (mode === 'commits') {
      const commits = commitCounts();
      const activeDays = [...commits.keys()].length;
      elements.activitySelection.textContent = commits.size
        ? `${activeDays} active days · last year`
        : 'no commit snapshot yet · run sync';
    } else if (state.date) {
      elements.activitySelection.textContent = `${localDateLabel(state.date)} · tap again to clear`;
    } else {
      const builds = buildLogCounts();
      const activeDays = [...builds.keys()].length;
      elements.activitySelection.textContent = `${activeDays} active days · last year`;
    }
  }

  function renderActivityMap({ syncTrack = true, animateTrack = false } = {}) {
    const buildsEl = elements.activityMapBuilds;
    const commitsEl = elements.activityMapCommits;
    if (!buildsEl && !commitsEl) return;

    const { builds, commits } = activityWindowRange();
    const buildsGrid = buildActivityGridHtml(builds, {
      mode: 'builds',
      unit: 'build',
      units: 'builds',
      selectable: true,
    });
    const commitsGrid = buildActivityGridHtml(commits, {
      mode: 'commits',
      unit: 'commit',
      units: 'commits',
      selectable: false,
    });

    if (buildsEl) {
      buildsEl.style.setProperty('--activity-weeks', String(ACTIVITY_WEEKS));
      buildsEl.innerHTML = buildsGrid.html;
    }
    if (commitsEl) {
      commitsEl.style.setProperty('--activity-weeks', String(ACTIVITY_WEEKS));
      commitsEl.innerHTML = commitsGrid.html;
    }

    updateActivitySelectionStats();

    if (syncTrack) {
      setActivityTrackPosition(activityPageIndex(state.activityMode), { animate: animateTrack });
    }
  }

  /** Desktop only: hover/focus morphs compact dots → square calendar. Mobile stays dots. */
  function bindActivityExpand() {
    const root = document.querySelector('.activity');
    if (!root) return;
    const fineHover = window.matchMedia('(hover: hover) and (pointer: fine)');

    const setExpanded = (on) => {
      if (!fineHover.matches) {
        root.classList.remove('is-expanded');
        return;
      }
      root.classList.toggle('is-expanded', on);
    };

    root.addEventListener('mouseenter', () => setExpanded(true));
    root.addEventListener('mouseleave', () => setExpanded(false));
    root.addEventListener('focusin', () => setExpanded(true));
    root.addEventListener('focusout', (event) => {
      if (!root.contains(event.relatedTarget)) setExpanded(false);
    });
    fineHover.addEventListener('change', () => {
      if (!fineHover.matches) root.classList.remove('is-expanded');
    });
  }

  /**
   * Horizontal swipe: drag the dual-page track, then snap to build log or commits.
   * Uses pointer capture so cell buttons don't swallow the gesture.
   */
  function bindActivitySwipe() {
    const viewport = elements.activityViewport
      || document.querySelector('#activity-viewport');
    if (!viewport) return;

    let startX = 0;
    let startY = 0;
    let pointerId = null;
    let tracking = false;
    let axis = null; // 'x' | 'y' once decided
    let suppressClick = false;
    let startPage = 0;

    const reset = () => {
      tracking = false;
      pointerId = null;
      axis = null;
    };

    const rubberBand = (page, dx) => {
      // Resist dragging past the ends.
      if (page === 0 && dx > 0) return dx * 0.28;
      if (page === 1 && dx < 0) return dx * 0.28;
      return dx;
    };

    viewport.addEventListener('pointerdown', (event) => {
      // Touch / pen only — desktop keeps pill buttons (still animates on change).
      if (event.pointerType === 'mouse') return;
      if (!event.isPrimary) return;
      tracking = true;
      axis = null;
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      startPage = activityPageIndex();
      try {
        viewport.setPointerCapture(event.pointerId);
      } catch (_) { /* ignore */ }
    });

    viewport.addEventListener('pointermove', (event) => {
      if (!tracking || event.pointerId !== pointerId) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (!axis && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
        axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
      }
      if (axis !== 'x') return;
      if (event.cancelable) event.preventDefault();
      setActivityTrackPosition(startPage, {
        dragPx: rubberBand(startPage, dx),
        animate: false,
      });
    }, { passive: false });

    viewport.addEventListener('pointerup', (event) => {
      if (!tracking || event.pointerId !== pointerId) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      const wasHorizontal = axis === 'x';
      const width = viewport.clientWidth || 1;
      reset();
      try {
        if (viewport.hasPointerCapture?.(event.pointerId)) {
          viewport.releasePointerCapture(event.pointerId);
        }
      } catch (_) { /* ignore */ }

      if (!wasHorizontal) {
        setActivityTrackPosition(activityPageIndex(), { animate: true });
        return;
      }

      // Commit if past ~22% of the pane or a firm flick.
      const shouldFlip = Math.abs(dx) > Math.max(36, width * 0.22)
        && Math.abs(dx) >= Math.abs(dy) * 1.05;
      let nextPage = startPage;
      if (shouldFlip) {
        if (dx < 0 && startPage === 0) nextPage = 1;
        if (dx > 0 && startPage === 1) nextPage = 0;
      }

      if (nextPage !== startPage) {
        suppressClick = true;
        window.setTimeout(() => { suppressClick = false; }, 450);
        const nextMode = nextPage === 1 ? 'commits' : 'builds';
        // Slide from current drag offset → target page (maps already both rendered).
        setActivityMode(nextMode, { animate: true });
        updateActivitySelectionStats();
        // Archive day filter only applies in build-log mode.
        if (nextMode === 'commits' || state.date) {
          renderArchive();
          renderFilterSummary();
          writeUrlState();
        }
      } else {
        // Snap back
        setActivityTrackPosition(startPage, { animate: true });
      }
    });

    viewport.addEventListener('pointercancel', (event) => {
      if (event.pointerId !== pointerId) return;
      reset();
      setActivityTrackPosition(activityPageIndex(), { animate: true });
    });

    // Swallow the synthetic click after a successful swipe so a day isn't filtered.
    viewport.addEventListener('click', (event) => {
      if (!suppressClick) return;
      event.preventDefault();
      event.stopPropagation();
    }, true);

    // Keep track aligned if the viewport resizes (rotation, browser chrome).
    window.addEventListener('resize', () => {
      setActivityTrackPosition(activityPageIndex(), { animate: false });
    });
  }

  function renderArchive() {
    const projects = getFilteredProjects();
    elements.resultCount.textContent = `${projects.length} / ${state.projects.length}`;
    elements.emptyState.hidden = projects.length !== 0;

    elements.archive.innerHTML = projects.map((project, index) => {
      const categoryTags = (project.categories || []).map((category) => (
        `<button type="button" data-filter-kind="category" data-filter-value="${escapeHtml(category)}">#${escapeHtml(labelForCategory(category))}</button>`
      ));
      const formatTags = (project.formats || []).map((format) => (
        `<button type="button" data-filter-kind="format" data-filter-value="${escapeHtml(format)}">.${escapeHtml(format.replaceAll(' ', '-'))}</button>`
      ));
      const typeTags = (project.types || [])
        .filter((type) => type !== 'public')
        .map((type) => `<span class="type-tag">[${escapeHtml(type)}]</span>`);

      const links = Array.isArray(project.links) && project.links.length
        ? project.links
        : [{ label: 'open', url: project.url }];
      const linkTags = links.map((link) => (
        `<a href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer">${escapeHtml(link.label)} ↗</a>`
      ));
      const shopUrl = shopUrlFor(project);
      if (shopUrl) {
        linkTags.push(
          `<a href="${escapeHtml(shopUrl)}" target="_blank" rel="noreferrer" title="Same project as a 3D shop prop">shop ↗</a>`,
        );
      }

      return `
        <article class="project-row is-enter" style="animation-delay:${Math.min(index, 12) * 12}ms">
          <time datetime="${escapeHtml(project.date)}">${escapeHtml(project.date)}</time>
          <div class="project-row__main">
            <h3><a href="${escapeHtml(project.url)}" target="_blank" rel="noreferrer">${escapeHtml(projectLabel(project))} <span aria-hidden="true">↗</span></a></h3>
            <p>${escapeHtml(project.description)}</p>
            ${renderHierarchyPath(project)}
            <div class="project-row__links">${linkTags.join('')}</div>
          </div>
          <div class="project-row__tags">${[...categoryTags, ...formatTags, ...typeTags].join('')}</div>
        </article>`;
    }).join('');
  }

  function shopUrlFor(project) {
    if (!project || !SHOP_PROJECT_IDS.has(project.id)) return '';
    const base =
      state.surfaces?.interactivePortfolio?.url ||
      'https://kvnloo.github.io/portfolio/demos/room/';
    return base;
  }

  function renderSummary() {
    const years = sortUnique(state.projects.map((project) => project.date.slice(0, 4)));
    const firstYear = years[0] || '';
    const lastYear = years.at(-1) || '';
    const range = firstYear === lastYear ? firstYear : `${firstYear}—${lastYear}`;
    const products = new Set(state.projects.map((p) => p.product).filter(Boolean)).size;
    elements.archiveSummary.textContent = `zer0 · ${state.projects.length} projects · ${products} products · ${range}`;
  }

  function renderFocusProducts() {
    if (!elements.focusProducts) return;
    const hierarchy = state.hierarchy;
    const byProduct = Object.fromEntries((hierarchy?.products || []).map((p) => [p.id, p]));
    const byKind = Object.fromEntries((hierarchy?.kinds || []).map((k) => [k.id, k]));
    let focus = Array.isArray(hierarchy?.focus) ? hierarchy.focus : [];

    // Back-compat: focusProducts → product chips
    if (!focus.length && Array.isArray(hierarchy?.focusProducts)) {
      focus = hierarchy.focusProducts.map((id) => ({ type: 'product', id }));
    }

    if (!focus.length) {
      const featured = state.projects
        .filter((p) => p.featured)
        .sort((a, b) => (a.featuredRank || 99) - (b.featuredRank || 99));
      const seen = new Set();
      focus = [];
      for (const project of featured) {
        if (project.kind === 'experiment' && !seen.has('kind:experiment')) {
          seen.add('kind:experiment');
          focus.push({ type: 'kind', id: 'experiment' });
        } else if (project.product && !seen.has(`product:${project.product}`)) {
          seen.add(`product:${project.product}`);
          focus.push({ type: 'product', id: project.product });
        }
      }
    }

    const presentProducts = new Set(state.projects.map((p) => p.product).filter(Boolean));
    const presentKinds = new Set(state.projects.map((p) => projectKind(p)).filter(Boolean));

    const chips = focus.map((item) => {
      const type = item?.type === 'kind' ? 'kind' : 'product';
      const id = item?.id;
      if (!id) return '';
      if (type === 'kind') {
        if (!presentKinds.has(id) && !(hierarchy?.kinds || []).some((k) => k.id === id)) return '';
        const labelSrc = byKind[id]?.name || id;
        const active = effectiveKind() === id && !state.product ? ' is-active' : '';
        return `<button type="button" class="intro__focus-chip${active}" data-filter-kind="kind" data-filter-value="${escapeHtml(id)}">${htmlSoftLabel(labelSrc)}</button>`;
      }
      if (!presentProducts.has(id) && !byProduct[id]) return '';
      const labelSrc = byProduct[id]?.name || id;
      const active = state.product === id ? ' is-active' : '';
      return `<button type="button" class="intro__focus-chip${active}" data-filter-kind="product" data-filter-value="${escapeHtml(id)}">${htmlSoftLabel(labelSrc)}</button>`;
    }).filter(Boolean);

    elements.focusProducts.innerHTML = chips.join('');
  }

  function effectiveKind() {
    return state.kind || state.portfolio || '';
  }

  function populateFilters() {
    const categories = sortUnique(state.projects.flatMap((project) => project.categories || []));
    const formats = sortUnique(state.projects.flatMap((project) => project.formats || []));
    const years = sortUnique(state.projects.map((project) => project.date.slice(0, 4))).reverse();
    const kinds = sortUnique(state.projects.map((p) => projectKind(p)).filter(Boolean));
    const kindLabels = Object.fromEntries(
      state.projects
        .filter((p) => projectKind(p))
        .map((p) => [projectKind(p), p.kindName || p.portfolioName || projectKind(p)]),
    );
    // Prefer hierarchy kind order when available.
    const orderedKinds = (state.hierarchy?.kinds || [])
      .map((k) => k.id)
      .filter((id) => kinds.includes(id));
    for (const id of kinds) {
      if (!orderedKinds.includes(id)) orderedKinds.push(id);
    }
    const products = sortUnique(state.projects.map((p) => p.product).filter(Boolean));
    const productLabels = Object.fromEntries(
      state.projects.filter((p) => p.product).map((p) => [p.product, p.productName || p.product]),
    );

    if (elements.kind) {
      elements.kind.innerHTML = '<option value="">all</option>' + orderedKinds
        .map((id) => `<option value="${escapeHtml(id)}">${escapeHtml(softLabel(kindLabels[id] || id))}</option>`)
        .join('');
    }
    if (elements.product) {
      const kindFilter = effectiveKind();
      const productOptions = products.filter((id) => {
        if (!kindFilter) return true;
        // Product options only for the selected kind; experiments have no product.
        if (kindFilter === 'experiment') return false;
        return state.projects.some((p) => p.product === id && projectKind(p) === kindFilter);
      });
      elements.product.innerHTML = '<option value="">all</option>' + productOptions
        .map((id) => `<option value="${escapeHtml(id)}">${escapeHtml(softLabel(productLabels[id] || id))}</option>`)
        .join('');
    }
    elements.category.innerHTML = '<option value="">all</option>' + categories
      .map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(labelForCategory(category))}</option>`)
      .join('');
    elements.format.innerHTML = '<option value="">all</option>' + formats
      .map((format) => `<option value="${escapeHtml(format)}">${escapeHtml(format)}</option>`)
      .join('');
    elements.year.innerHTML = '<option value="">all</option>' + years
      .map((year) => `<option value="${escapeHtml(year)}">${escapeHtml(year)}</option>`)
      .join('');
  }

  function activeFilterCount() {
    return [
      Boolean(state.query),
      Boolean(effectiveKind()),
      Boolean(state.product),
      Boolean(state.category),
      Boolean(state.format),
      Boolean(state.year),
      Boolean(state.date),
      state.sort !== 'newest',
    ].filter(Boolean).length;
  }

  function renderFilterSummary() {
    const count = activeFilterCount();
    elements.filterSummary.textContent = count ? `${count} active` : 'all projects';
  }

  function readUrlState() {
    const params = new URLSearchParams(window.location.search);
    state.query = params.get('q') || '';
    // Prefer kind; accept legacy portfolio= as alias.
    state.kind = params.get('kind') || params.get('portfolio') || '';
    state.portfolio = state.kind; // keep alias in sync
    state.product = params.get('product') || '';
    state.category = params.get('topic') || '';
    state.format = params.get('format') || '';
    state.year = params.get('year') || '';
    state.date = params.get('date') || '';
    state.sort = params.get('sort') || 'newest';

    elements.search.value = state.query;
    if (elements.kind) elements.kind.value = state.kind;
    if (elements.product) elements.product.value = state.product;
    elements.category.value = state.category;
    elements.format.value = state.format;
    elements.year.value = state.year;
    elements.sort.value = state.sort;

    state.kind = elements.kind?.value || state.kind || '';
    state.portfolio = state.kind;
    state.product = elements.product?.value || '';
    state.category = elements.category.value;
    state.format = elements.format.value;
    state.year = elements.year.value;
    state.sort = elements.sort.value || 'newest';
    elements.filterDisclosure.open = activeFilterCount() > 0;
  }

  function writeUrlState() {
    const params = new URLSearchParams();
    if (state.query) params.set('q', state.query);
    const kind = effectiveKind();
    if (kind) params.set('kind', kind);
    if (state.product) params.set('product', state.product);
    if (state.category) params.set('topic', state.category);
    if (state.format) params.set('format', state.format);
    if (state.year) params.set('year', state.year);
    if (state.date) params.set('date', state.date);
    if (state.sort !== 'newest') params.set('sort', state.sort);
    const query = params.toString();
    history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
  }

  function render() {
    // Keep product options coherent with selected kind.
    const currentKind = effectiveKind();
    const currentProduct = state.product;
    populateFilters();
    if (elements.kind) {
      elements.kind.value = currentKind;
      state.kind = currentKind;
      state.portfolio = currentKind;
    }
    if (elements.product) {
      if (currentProduct && [...elements.product.options].some((o) => o.value === currentProduct)) {
        elements.product.value = currentProduct;
        state.product = currentProduct;
      } else {
        elements.product.value = '';
        state.product = '';
      }
    }
    renderFocusProducts();
    renderArchive();
    renderActivityMap();
    renderFilterSummary();
    writeUrlState();
  }

  function clearFilters() {
    state.query = '';
    state.kind = '';
    state.portfolio = '';
    state.product = '';
    state.category = '';
    state.format = '';
    state.year = '';
    state.date = '';
    state.sort = 'newest';
    elements.search.value = '';
    if (elements.kind) elements.kind.value = '';
    if (elements.product) elements.product.value = '';
    elements.category.value = '';
    elements.format.value = '';
    elements.year.value = '';
    elements.sort.value = 'newest';
    elements.filterDisclosure.open = false;
    render();
  }

  function bindEvents() {
    elements.search.addEventListener('input', () => {
      state.query = elements.search.value;
      render();
    });
    elements.kind?.addEventListener('change', () => {
      state.kind = elements.kind.value;
      state.portfolio = state.kind;
      state.product = '';
      render();
    });
    elements.product?.addEventListener('change', () => {
      state.product = elements.product.value;
      // Align kind with product when picking a product first.
      if (state.product) {
        const sample = state.projects.find((p) => p.product === state.product);
        const k = sample ? projectKind(sample) : '';
        if (k) {
          state.kind = k;
          state.portfolio = k;
          if (elements.kind) elements.kind.value = k;
        }
      }
      render();
    });
    elements.category.addEventListener('change', () => {
      state.category = elements.category.value;
      render();
    });
    elements.format.addEventListener('change', () => {
      state.format = elements.format.value;
      render();
    });
    elements.year.addEventListener('change', () => {
      state.year = elements.year.value;
      render();
    });
    elements.sort.addEventListener('change', () => {
      state.sort = elements.sort.value;
      render();
    });
    elements.clearFilters.addEventListener('click', clearFilters);
    document.querySelector('[data-clear-filters]')?.addEventListener('click', clearFilters);

    elements.themeToggle?.addEventListener('click', () => {
      const toggle = elements.themeToggle;
      toggle?.classList.remove('is-switching');
      // reflow so the glow pulse can re-trigger
      void toggle?.offsetWidth;
      toggle?.classList.add('is-switching');
      setTheme(getTheme() === 'night' ? 'day' : 'night');
      window.setTimeout(() => toggle?.classList.remove('is-switching'), 450);
    });

    const onActivityModeClick = (event) => {
      const mode = event.currentTarget?.dataset?.activityMode;
      if (!mode || mode === state.activityMode) return;
      setActivityMode(mode, { animate: true });
      updateActivitySelectionStats();
      renderArchive();
      renderFilterSummary();
      writeUrlState();
    };
    elements.activityModeBuilds?.addEventListener('click', onActivityModeClick);
    elements.activityModeCommits?.addEventListener('click', onActivityModeClick);
    bindActivityExpand();
    bindActivitySwipe();

    elements.randomBuild.addEventListener('click', () => {
      const pool = getFilteredProjects();
      const project = pool[Math.floor(Math.random() * pool.length)] || state.projects[0];
      if (project) window.open(project.url, '_blank', 'noopener,noreferrer');
    });

    elements.activityViewport?.addEventListener('click', (event) => {
      const cell = event.target.closest('[data-activity-date]');
      if (!cell) return;
      // Only the build-log page filters the archive by day.
      if (state.activityMode === 'commits' || cell.dataset.activityMode === 'commits') return;
      const date = cell.dataset.activityDate || '';
      state.date = state.date === date ? '' : date;
      render();
      document.querySelector('#archive-title').scrollIntoView({ block: 'start', behavior: 'smooth' });
    });

    const onHierarchyFilterClick = (event) => {
      const button = event.target.closest('[data-filter-kind]');
      if (!button) return;
      const filterKind = button.dataset.filterKind;
      const value = button.dataset.filterValue || '';
      if (filterKind === 'category') {
        state.category = value;
        elements.category.value = value;
      }
      if (filterKind === 'format') {
        state.format = value;
        elements.format.value = value;
      }
      if (filterKind === 'kind' || filterKind === 'portfolio') {
        // Toggle kind when re-clicking an active focus chip.
        if (effectiveKind() === value && !state.product && button.classList.contains('intro__focus-chip')) {
          state.kind = '';
          state.portfolio = '';
          state.product = '';
          if (elements.kind) elements.kind.value = '';
          if (elements.product) elements.product.value = '';
        } else {
          state.kind = value;
          state.portfolio = value;
          state.product = '';
          if (elements.kind) elements.kind.value = value;
          if (elements.product) elements.product.value = '';
        }
      }
      if (filterKind === 'product') {
        // Toggle product filter when re-clicking an active focus chip.
        if (state.product === value && button.classList.contains('intro__focus-chip')) {
          state.product = '';
          if (elements.product) elements.product.value = '';
        } else {
          state.product = value;
          if (elements.product) elements.product.value = value;
          const sample = state.projects.find((p) => p.product === value);
          const k = sample ? projectKind(sample) : '';
          if (k) {
            state.kind = k;
            state.portfolio = k;
            if (elements.kind) elements.kind.value = k;
          }
        }
      }
      elements.filterDisclosure.open = true;
      render();
      document.querySelector('#archive-title').scrollIntoView({ block: 'start' });
    };

    elements.archive.addEventListener('click', onHierarchyFilterClick);
    elements.focusProducts?.addEventListener('click', onHierarchyFilterClick);

    document.addEventListener('keydown', (event) => {
      const tagName = document.activeElement?.tagName;
      const isEditing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tagName);
      if (event.key === '/' && !isEditing) {
        event.preventDefault();
        elements.filterDisclosure.open = true;
        elements.search.focus();
      }
      if (event.key === 'Escape' && document.activeElement === elements.search && elements.search.value) {
        elements.search.value = '';
        state.query = '';
        render();
      }
    });
  }

  function versionedDataUrl(path, dataVersion = BUILD_VERSION) {
    const url = new URL(path, DATA_ROOT);
    url.searchParams.set('v', `${BUILD_VERSION}-${dataVersion}`);
    return url;
  }

  async function loadProjects() {
    try {
      const manifestResponse = await fetch(versionedDataUrl('manifest.json'), { cache: 'no-store' });
      if (!manifestResponse.ok) throw new Error(`manifest: ${manifestResponse.status}`);
      const manifest = await manifestResponse.json();
      if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
        throw new Error('manifest contains no project files');
      }

      const dataVersion = manifest.generatedAt || BUILD_VERSION;
      const [hierarchy, surfaces, activity, ...chunks] = await Promise.all([
        fetch(versionedDataUrl('hierarchy.json', dataVersion), { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
        fetch(versionedDataUrl('surfaces.json', dataVersion), { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
        fetch(versionedDataUrl('activity.json', dataVersion), { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
        ...manifest.files.map(async (file) => {
          const response = await fetch(versionedDataUrl(file, dataVersion), { cache: 'no-store' });
          if (!response.ok) throw new Error(`${file}: ${response.status}`);
          return response.json();
        }),
      ]);

      state.hierarchy = hierarchy;
      state.surfaces = surfaces || manifest.surfaces || {
        interactivePortfolio: manifest.interactivePortfolio || null,
      };
      state.activity = activity;
      state.projects = chunks
        .flatMap((chunk) => chunk.projects || [])
        .filter((project) => Array.isArray(project.types) && project.types.includes('public'));

      let savedMode = 'builds';
      try {
        savedMode = localStorage.getItem(ACTIVITY_MODE_KEY) === 'commits' ? 'commits' : 'builds';
      } catch (_) { /* ignore */ }
      // Fall back to builds if no commit snapshot is available yet.
      if (savedMode === 'commits' && !(activity?.commits && Object.keys(activity.commits).length)) {
        savedMode = 'builds';
      }

      populateFilters();
      readUrlState();
      setActivityMode(savedMode);
      renderSummary();
      renderFocusProducts();
      renderFeatured();
      renderActivityMap();
      render();
      bindEvents();
      setTheme(getTheme());
    } catch (error) {
      console.error('boplog data load failed', error);
      elements.resultCount.textContent = 'latest 12 shown';
      elements.archiveSummary.textContent = 'Static preview · machine-readable archive available below';
    }
  }

  elements.currentYear.textContent = new Date().getFullYear();
  setTheme(getTheme());
  loadProjects();
})();
