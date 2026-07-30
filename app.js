(() => {
  'use strict';

  const BUILD_VERSION = '20260730.6';
  const DATA_ROOT = new URL('./data/', document.baseURI);
  const THEME_KEY = 'boplog-theme';
  const ACTIVITY_MODE_KEY = 'boplog-activity-mode';
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
    portfolio: '',
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
    search: document.querySelector('#project-search'),
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
    activityMap: document.querySelector('#activity-map'),
    activitySelection: document.querySelector('#activity-selection'),
    activityNote: document.querySelector('#activity-note'),
    activityModeBuilds: document.querySelector('#activity-mode-builds'),
    activityModeCommits: document.querySelector('#activity-mode-commits'),
    themeToggle: document.querySelector('#theme-toggle'),
  };

  const categoryLabels = {
    ai: 'AI',
    dev: 'dev',
    vc: 'VC',
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
   */
  function softLabel(value = '') {
    const raw = String(value);
    if (!raw) return '';
    // Keep leading . / _ (e.g. .files, _pm)
    const lead = raw.match(/^[._]+/)?.[0] || '';
    const body = lead ? raw.slice(lead.length) : raw;
    const split = body
      .replace(/([a-z0-9])([A-Z])/g, '$1·$2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1·$2')
      .replace(/([A-Za-z])([0-9])/g, '$1·$2')
      .replace(/([0-9])([A-Za-z])/g, '$1·$2');
    return lead + split;
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
    const portfolio = project.portfolioName || project.portfolio || '';
    const product = project.productName || project.product || '';
    return { company, portfolio, product };
  }

  function renderHierarchyPath(project, { interactive = true } = {}) {
    const { company, portfolio, product } = hierarchyPath(project);
    if (!portfolio && !product) return '';
    const parts = [];
    parts.push(`<span>${escapeHtml(company)}</span>`);
    if (portfolio) {
      parts.push('<span class="sep">/</span>');
      if (interactive) {
        parts.push(`<button type="button" data-filter-kind="portfolio" data-filter-value="${escapeHtml(project.portfolio || '')}">${escapeHtml(softLabel(portfolio))}</button>`);
      } else {
        parts.push(`<span>${escapeHtml(softLabel(portfolio))}</span>`);
      }
    }
    if (product) {
      parts.push('<span class="sep">/</span>');
      if (interactive) {
        parts.push(`<button type="button" data-filter-kind="product" data-filter-value="${escapeHtml(project.product || '')}">${escapeHtml(softLabel(product))}</button>`);
      } else {
        parts.push(`<span>${escapeHtml(softLabel(product))}</span>`);
      }
    }
    return `<div class="project-row__path">${parts.join('')}</div>`;
  }

  function getFilteredProjects() {
    const query = normalize(state.query);
    const filtered = state.projects.filter((project) => {
      if (query && !projectSearchText(project).includes(query)) return false;
      if (state.portfolio && project.portfolio !== state.portfolio) return false;
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

  function setActivityMode(mode) {
    const next = mode === 'commits' ? 'commits' : 'builds';
    state.activityMode = next;
    try { localStorage.setItem(ACTIVITY_MODE_KEY, next); } catch (_) { /* ignore */ }

    elements.activityModeBuilds?.classList.toggle('is-active', next === 'builds');
    elements.activityModeCommits?.classList.toggle('is-active', next === 'commits');
    elements.activityModeBuilds?.setAttribute('aria-pressed', next === 'builds' ? 'true' : 'false');
    elements.activityModeCommits?.setAttribute('aria-pressed', next === 'commits' ? 'true' : 'false');

    if (elements.activityNote) {
      elements.activityNote.textContent = next === 'commits'
        ? 'All-commits mode uses your GitHub contribution calendar snapshot (profile green squares), not only rows on this site.'
        : 'Build-log mode counts only entries published on this website — not every git commit.';
    }

    // Day click filters the archive only for build-log entries.
    if (next === 'commits' && state.date) {
      state.date = '';
    }
  }

  function renderActivityMap() {
    if (!elements.activityMap) return;
    const mode = state.activityMode === 'commits' ? 'commits' : 'builds';
    const counts = mode === 'commits' ? commitCounts() : buildLogCounts();
    const unit = mode === 'commits' ? 'commit' : 'build';
    const units = mode === 'commits' ? 'commits' : 'builds';

    const today = new Date();
    today.setUTCHours(12, 0, 0, 0);
    const latestFromCounts = [...counts.keys()].sort().at(-1);
    const latestProject = [...state.projects].sort((a, b) => b.date.localeCompare(a.date))[0];
    const latestDate = latestFromCounts
      ? new Date(`${latestFromCounts}T12:00:00Z`)
      : (latestProject ? new Date(`${latestProject.date}T12:00:00Z`) : today);
    const end = latestDate > today ? latestDate : today;
    end.setUTCDate(end.getUTCDate() + (6 - end.getUTCDay()));
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - (52 * 7 - 1));
    const maxCount = Math.max(1, ...counts.values(), 0);
    const weeks = [];
    const monthLabels = [];
    let previousMonth = -1;

    for (let week = 0; week < 52; week += 1) {
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
        const selected = mode === 'builds' && value === state.date;
        const label = `${count} ${count === 1 ? unit : units} on ${localDateLabel(value)}`;
        const disabled = mode === 'commits' ? '' : '';
        days.push(`<button class="activity__cell${selected ? ' is-selected' : ''}" type="button" data-activity-date="${value}" data-level="${activityLevel(count, maxCount)}" aria-pressed="${selected}" aria-label="${label}" title="${label}"${disabled}></button>`);
      }
      weeks.push(`<div class="activity__week">${days.join('')}</div>`);
    }

    elements.activityMap.innerHTML = `
      <div class="activity__months">${monthLabels.join('')}</div>
      <div class="activity__days" aria-hidden="true"><span>Mon</span><span>Wed</span><span>Fri</span></div>
      <div class="activity__weeks">${weeks.join('')}</div>`;

    if (mode === 'commits') {
      elements.activitySelection.textContent = counts.size
        ? 'last 52 weeks · GitHub commits'
        : 'no commit snapshot yet · run sync';
    } else {
      elements.activitySelection.textContent = state.date
        ? `${localDateLabel(state.date)} · click again to clear`
        : 'last 52 weeks · site build log only';
    }
  }

  function renderArchive() {
    const projects = getFilteredProjects();
    elements.resultCount.textContent = `${projects.length} / ${state.projects.length}`;
    elements.emptyState.hidden = projects.length !== 0;

    elements.archive.innerHTML = projects.map((project) => {
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
        <article class="project-row">
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

  function populateFilters() {
    const categories = sortUnique(state.projects.flatMap((project) => project.categories || []));
    const formats = sortUnique(state.projects.flatMap((project) => project.formats || []));
    const years = sortUnique(state.projects.map((project) => project.date.slice(0, 4))).reverse();
    const portfolios = sortUnique(state.projects.map((p) => p.portfolio).filter(Boolean));
    const portfolioLabels = Object.fromEntries(
      state.projects.filter((p) => p.portfolio).map((p) => [p.portfolio, p.portfolioName || p.portfolio]),
    );
    const products = sortUnique(state.projects.map((p) => p.product).filter(Boolean));
    const productLabels = Object.fromEntries(
      state.projects.filter((p) => p.product).map((p) => [p.product, p.productName || p.product]),
    );

    if (elements.portfolio) {
      elements.portfolio.innerHTML = '<option value="">all</option>' + portfolios
        .map((id) => `<option value="${escapeHtml(id)}">${escapeHtml(portfolioLabels[id] || id)}</option>`)
        .join('');
    }
    if (elements.product) {
      const productOptions = products.filter((id) => {
        if (!state.portfolio) return true;
        return state.projects.some((p) => p.product === id && p.portfolio === state.portfolio);
      });
      elements.product.innerHTML = '<option value="">all</option>' + productOptions
        .map((id) => `<option value="${escapeHtml(id)}">${escapeHtml(productLabels[id] || id)}</option>`)
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
      Boolean(state.portfolio),
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
    state.portfolio = params.get('portfolio') || '';
    state.product = params.get('product') || '';
    state.category = params.get('topic') || '';
    state.format = params.get('format') || '';
    state.year = params.get('year') || '';
    state.date = params.get('date') || '';
    state.sort = params.get('sort') || 'newest';

    elements.search.value = state.query;
    if (elements.portfolio) elements.portfolio.value = state.portfolio;
    if (elements.product) elements.product.value = state.product;
    elements.category.value = state.category;
    elements.format.value = state.format;
    elements.year.value = state.year;
    elements.sort.value = state.sort;

    state.portfolio = elements.portfolio?.value || '';
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
    if (state.portfolio) params.set('portfolio', state.portfolio);
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
    // Keep product options coherent with selected portfolio.
    if (elements.product) {
      const current = state.product;
      populateFilters();
      if (current && [...elements.product.options].some((o) => o.value === current)) {
        elements.product.value = current;
        state.product = current;
      } else {
        elements.product.value = '';
        state.product = '';
      }
      if (elements.portfolio) elements.portfolio.value = state.portfolio;
    }
    renderArchive();
    renderActivityMap();
    renderFilterSummary();
    writeUrlState();
  }

  function clearFilters() {
    state.query = '';
    state.portfolio = '';
    state.product = '';
    state.category = '';
    state.format = '';
    state.year = '';
    state.date = '';
    state.sort = 'newest';
    elements.search.value = '';
    if (elements.portfolio) elements.portfolio.value = '';
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
    elements.portfolio?.addEventListener('change', () => {
      state.portfolio = elements.portfolio.value;
      state.product = '';
      render();
    });
    elements.product?.addEventListener('change', () => {
      state.product = elements.product.value;
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
      setTheme(getTheme() === 'night' ? 'day' : 'night');
    });

    const onActivityModeClick = (event) => {
      const mode = event.currentTarget?.dataset?.activityMode;
      if (!mode || mode === state.activityMode) return;
      setActivityMode(mode);
      render();
    };
    elements.activityModeBuilds?.addEventListener('click', onActivityModeClick);
    elements.activityModeCommits?.addEventListener('click', onActivityModeClick);

    elements.randomBuild.addEventListener('click', () => {
      const pool = getFilteredProjects();
      const project = pool[Math.floor(Math.random() * pool.length)] || state.projects[0];
      if (project) window.open(project.url, '_blank', 'noopener,noreferrer');
    });

    elements.activityMap?.addEventListener('click', (event) => {
      const cell = event.target.closest('[data-activity-date]');
      if (!cell) return;
      // Only build-log mode filters the archive by day.
      if (state.activityMode === 'commits') return;
      const date = cell.dataset.activityDate || '';
      state.date = state.date === date ? '' : date;
      render();
      document.querySelector('#archive-title').scrollIntoView({ block: 'start', behavior: 'smooth' });
    });

    elements.archive.addEventListener('click', (event) => {
      const button = event.target.closest('[data-filter-kind]');
      if (!button) return;
      const kind = button.dataset.filterKind;
      const value = button.dataset.filterValue || '';
      if (kind === 'category') {
        state.category = value;
        elements.category.value = value;
      }
      if (kind === 'format') {
        state.format = value;
        elements.format.value = value;
      }
      if (kind === 'portfolio') {
        state.portfolio = value;
        state.product = '';
        if (elements.portfolio) elements.portfolio.value = value;
      }
      if (kind === 'product') {
        state.product = value;
        if (elements.product) elements.product.value = value;
        const sample = state.projects.find((p) => p.product === value);
        if (sample?.portfolio) {
          state.portfolio = sample.portfolio;
          if (elements.portfolio) elements.portfolio.value = sample.portfolio;
        }
      }
      elements.filterDisclosure.open = true;
      render();
      document.querySelector('#archive-title').scrollIntoView({ block: 'start' });
    });

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
