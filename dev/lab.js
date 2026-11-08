(() => {
  'use strict';

  const THEME_KEY = 'boplog-theme';
  const STATES = ['working', 'searching', 'solving', 'listening', 'composing', 'shaping'];
  const AGENTS = [
    { name: 'evolve · evidence loop', state: 'working' },
    { name: 'tmux-agent-fleet', state: 'searching' },
    { name: 'boplog · geo overnight', state: 'composing' },
  ];

  const reduced =
    typeof matchMedia !== 'undefined' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches;

  const isDark = () => document.documentElement.dataset.theme === 'night';

  /* ── shared mono orb engine (inspired by thinking-orbs language; simplified) ── */
  function hashD(a, b) {
    const h = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
    return h - Math.floor(h);
  }

  function paintDots(ctx, dots, dark) {
    dots.sort((a, b) => a.z - b.z);
    for (const d of dots) {
      const ink = dark ? 1 - d.white : d.white;
      const g = Math.round(ink * 255);
      const a = d.a == null ? 1 : d.a;
      ctx.beginPath();
      ctx.fillStyle = `rgba(${g},${g},${g},${a})`;
      ctx.arc(d.x, d.y, Math.max(0.35, d.r), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawOrb(ctx, size, t, dark, state) {
    const cx = size / 2;
    const cy = size / 2;
    const R = size * 0.38;
    const dots = [];
    const yaw = t * 0.35;
    const tilt = 0.45;
    const st = Math.sin(tilt);
    const ct = Math.cos(tilt);
    const sy = Math.sin(yaw);
    const cyw = Math.cos(yaw);
    const proj = (x, y, z) => {
      const x1 = x * cyw + z * sy;
      const z1 = -x * sy + z * cyw;
      const y1 = y * ct - z1 * st;
      const z2 = y * st + z1 * ct;
      return [cx + x1, cy - y1, z2];
    };

    if (state === 'working') {
      const orbits = size < 28 ? 4 : 7;
      for (let o = 0; o < orbits; o++) {
        const ro = R * (0.4 + 0.55 * hashD(o, 1));
        const speed = (0.4 + 0.6 * hashD(o, 2)) * (hashD(o, 3) > 0.5 ? 1 : -1);
        const ghost = size < 28 ? 10 : 22;
        for (let k = 0; k < ghost; k++) {
          const a = (k / ghost) * Math.PI * 2;
          const [px, py, z] = proj(Math.cos(a) * ro, Math.sin(a) * ro * 0.35, Math.sin(a + o) * ro * 0.55);
          dots.push({ x: px, y: py, z, r: size * 0.018, white: 0.55, a: 0.35 });
        }
        for (let m = 0; m < 2; m++) {
          const a = t * speed + m * Math.PI;
          const [px, py, z] = proj(Math.cos(a) * ro, Math.sin(a) * ro * 0.35, Math.sin(a + o) * ro * 0.55);
          const depth = (z / R + 1) / 2;
          dots.push({ x: px, y: py, z, r: size * (0.035 + 0.02 * depth), white: 0.2 + 0.2 * depth });
        }
      }
    } else if (state === 'searching') {
      const n = size < 28 ? 36 : 90;
      const scan = ((t * 1.4) % (Math.PI * 2));
      for (let i = 0; i < n; i++) {
        const u = i / n;
        const phi = Math.acos(2 * u - 1);
        const th = i * 2.399;
        const x = Math.sin(phi) * Math.cos(th) * R;
        const y = Math.cos(phi) * R;
        const z = Math.sin(phi) * Math.sin(th) * R;
        const [px, py, pz] = proj(x, y, z);
        const ang = Math.atan2(z, x);
        const d = Math.abs(Math.atan2(Math.sin(ang - scan), Math.cos(ang - scan)));
        const hot = Math.max(0, 1 - d / 0.55);
        dots.push({
          x: px, y: py, z: pz,
          r: size * (0.02 + 0.02 * hot),
          white: 0.55 - 0.35 * hot,
          a: 0.35 + 0.55 * hot,
        });
      }
    } else if (state === 'solving') {
      const bands = size < 28 ? 3 : 5;
      for (let b = 0; b < bands; b++) {
        const y0 = ((b / (bands - 1)) - 0.5) * R * 1.5;
        const scramble = Math.sin(t * 2 + b) > 0.65 ? Math.sin(t * 14 + b) * 0.12 * R : 0;
        const segs = size < 28 ? 12 : 24;
        for (let k = 0; k < segs; k++) {
          const a = (k / segs) * Math.PI * 2 + t * 0.15 * (b % 2 ? 1 : -1);
          const rr = Math.sqrt(Math.max(0, R * R - y0 * y0));
          const [px, py, z] = proj(Math.cos(a) * rr, y0 + scramble, Math.sin(a) * rr);
          dots.push({ x: px, y: py, z, r: size * 0.025, white: scramble ? 0.35 : 0.22 });
        }
      }
    } else if (state === 'listening') {
      const rings = size < 28 ? 3 : 5;
      for (let r = 0; r < rings; r++) {
        const ro = R * (0.35 + r * 0.16);
        const n = size < 28 ? 14 : 28;
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2;
          const wave = Math.sin(a * 3 - t * 4 + r) * (0.08 + 0.04 * r) * R;
          const [px, py, z] = proj(Math.cos(a) * ro, wave, Math.sin(a) * ro);
          dots.push({ x: px, y: py, z, r: size * 0.022, white: 0.3 + 0.1 * r / rings });
        }
      }
    } else if (state === 'composing') {
      const bands = size < 28 ? 2 : 4;
      for (let b = 0; b < bands; b++) {
        const n = size < 28 ? 16 : 36;
        for (let k = 0; k < n; k++) {
          const u = k / n;
          const a = u * Math.PI * 2 + t * 0.4;
          const wob = Math.sin(u * Math.PI * 4 + t * 2 + b) * 0.18 * R;
          const ro = R * (0.55 + b * 0.12) + wob;
          const y = Math.sin(u * Math.PI * 2 + t + b) * 0.25 * R;
          const [px, py, z] = proj(Math.cos(a) * ro, y, Math.sin(a) * ro * 0.7);
          dots.push({ x: px, y: py, z, r: size * 0.02, white: 0.28 + b * 0.08 });
        }
      }
    } else {
      // shaping: circle → triangle → square
      const phase = (t * 0.35) % 3;
      const shape = Math.floor(phase);
      const blend = phase - shape;
      const n = size < 28 ? 18 : 40;
      const point = (i, s) => {
        const u = i / n;
        if (s === 0) {
          const a = u * Math.PI * 2;
          return [Math.cos(a) * R, Math.sin(a) * R, 0];
        }
        if (s === 1) {
          const tri = [
            [0, -R], [R * 0.9, R * 0.7], [-R * 0.9, R * 0.7],
          ];
          const seg = u * 3;
          const si = Math.floor(seg) % 3;
          const f = seg - Math.floor(seg);
          const a = tri[si];
          const b = tri[(si + 1) % 3];
          return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, 0];
        }
        const sq = u * 4;
        const si = Math.floor(sq) % 4;
        const f = sq - Math.floor(sq);
        const corners = [[R, -R], [R, R], [-R, R], [-R, -R]];
        const a = corners[si];
        const b = corners[(si + 1) % 4];
        return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, 0];
      };
      const next = (shape + 1) % 3;
      for (let i = 0; i < n; i++) {
        const a = point(i, shape);
        const b = point(i, next);
        const x = a[0] + (b[0] - a[0]) * blend;
        const y = a[1] + (b[1] - a[1]) * blend;
        const [px, py, z] = proj(x, y, Math.sin(i + t) * R * 0.08);
        dots.push({ x: px, y: py, z, r: size * 0.028, white: 0.25 });
      }
    }

    ctx.clearRect(0, 0, size, size);
    paintDots(ctx, dots, dark);
  }

  /** Mount a canvas orb. Returns controller { setState, destroy }. */
  function mountOrb(canvas, { size = 20, state = 'working', speed = 1 } = {}) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    const ctx = canvas.getContext('2d');
    let current = state;
    let raf = 0;
    let running = false;
    let visible = true;

    const frame = (tSec) => {
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawOrb(ctx, size, tSec * speed, isDark(), current);
    };

    if (reduced) {
      frame(0.7);
      return {
        setState(s) { current = s; frame(0.7); },
        destroy() {},
      };
    }

    const loop = () => {
      frame((performance.now() / 1000));
      if (running) raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (running || document.visibilityState === 'hidden' || !visible) return;
      running = true;
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    frame(0.5);
    const io = typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver(([e]) => {
          visible = e.isIntersecting;
          if (visible) start();
          else stop();
        })
      : null;
    io?.observe(canvas);
    const onVis = () => {
      if (document.visibilityState === 'hidden') stop();
      else if (visible) start();
    };
    document.addEventListener('visibilitychange', onVis);
    if (!io) start();

    return {
      setState(s) {
        current = s;
        if (!running) frame((performance.now() / 1000));
      },
      destroy() {
        stop();
        io?.disconnect();
        document.removeEventListener('visibilitychange', onVis);
      },
    };
  }

  /* ── theme ── */
  function setTheme(next) {
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch (_) { /* ignore */ }
    const meta = document.querySelector('meta[name="theme-color"]:not([media]), meta[name="theme-color"]');
    // Force orb redraws by toggling a class consumers can ignore — re-paint via rAF naturally picks isDark()
  }

  document.querySelector('#theme-toggle')?.addEventListener('click', () => {
    setTheme(isDark() ? 'day' : 'night');
  });

  const labUrl = document.querySelector('#lab-url');
  if (labUrl) labUrl.textContent = window.location.href;

  /* ── 1. agents strip ── */
  const agentList = document.querySelector('#agent-list');
  const agentStrip = document.querySelector('#agent-strip');
  const agentCtrls = [];
  let agentRotate = true;

  function renderAgents() {
    if (!agentList) return;
    agentList.innerHTML = '';
    agentCtrls.length = 0;
    for (const agent of AGENTS) {
      const li = document.createElement('li');
      li.className = 'agent-strip__item';
      const canvas = document.createElement('canvas');
      const name = document.createElement('span');
      name.className = 'agent-strip__name';
      name.textContent = agent.name;
      const st = document.createElement('span');
      st.className = 'agent-strip__state';
      st.textContent = agent.state;
      li.append(canvas, name, st);
      agentList.append(li);
      const ctrl = mountOrb(canvas, { size: 20, state: agent.state, speed: 1 });
      agentCtrls.push({ ctrl, agent, st });
    }
  }
  renderAgents();
  if (agentStrip) agentStrip.classList.add('is-live');

  setInterval(() => {
    if (!agentRotate || reduced) return;
    for (const row of agentCtrls) {
      if (Math.random() > 0.4) continue;
      const next = STATES[Math.floor(Math.random() * STATES.length)];
      row.agent.state = next;
      row.st.textContent = next;
      row.ctrl.setState(next);
    }
  }, 4200);

  /* ── 2. orb gallery ── */
  const orbGrid = document.querySelector('#orb-grid');
  if (orbGrid) {
    for (const state of STATES) {
      const card = document.createElement('div');
      card.className = 'orb-card';
      const sizes = document.createElement('div');
      sizes.className = 'orb-card__sizes';
      for (const size of [64, 20]) {
        const c = document.createElement('canvas');
        sizes.append(c);
        mountOrb(c, { size, state, speed: 1 });
      }
      const label = document.createElement('div');
      label.className = 'orb-card__label';
      label.textContent = state;
      card.append(sizes, label);
      orbGrid.append(card);
    }
  }

  /* ── 3. activity map ── */
  const actMap = document.querySelector('#act-map');
  const actScan = document.querySelector('#act-scan');
  const actMeta = document.querySelector('#act-meta');
  let pulseOn = true;
  let scanOn = true;
  let latestCell = null;

  function buildActivity() {
    if (!actMap) return;
    const weeks = 20;
    actMap.style.setProperty('--weeks', String(weeks));
    actMap.innerHTML = '';
    let lastActive = null;
    for (let w = 0; w < weeks; w++) {
      const col = document.createElement('div');
      col.className = 'act__week';
      for (let d = 0; d < 7; d++) {
        const cell = document.createElement('div');
        cell.className = 'act__cell';
        // denser toward the end (recent activity)
        const bias = w / weeks;
        const roll = Math.random();
        let level = 0;
        if (roll < 0.12 + bias * 0.35) level = 1;
        if (roll < 0.05 + bias * 0.18) level = 2;
        if (roll < 0.02 + bias * 0.1) level = 3;
        if (roll < 0.008 + bias * 0.05) level = 4;
        // force a recent hot cell
        if (w === weeks - 1 && d === 4) level = 4;
        cell.dataset.level = String(level);
        if (level > 0) lastActive = cell;
        col.append(cell);
      }
      actMap.append(col);
    }
    latestCell = lastActive;
    applyPulse();
  }

  function applyPulse() {
    actMap?.querySelectorAll('.is-pulse').forEach((el) => el.classList.remove('is-pulse'));
    if (pulseOn && latestCell && !reduced) latestCell.classList.add('is-pulse');
  }

  buildActivity();

  document.querySelectorAll('.act__mode').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.act__mode').forEach((b) => b.classList.toggle('is-active', b === btn));
      if (scanOn && actScan && !reduced) {
        actScan.hidden = false;
        actScan.style.animation = 'none';
        void actScan.offsetWidth;
        actScan.style.animation = '';
        window.setTimeout(() => { actScan.hidden = true; }, 540);
      }
      if (actMeta) {
        actMeta.textContent = btn.dataset.mode === 'commits'
          ? 'all commits snapshot · latest cell still the only one that breathes'
          : 'build-log mode · latest active day pulses';
      }
    });
  });

  /* ── 4. rows ── */
  const demoRows = document.querySelector('#demo-rows');
  const today = new Date();
  const iso = (offset) => {
    const d = new Date(today);
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  };
  const SAMPLE = [
    { date: iso(0), name: 'evolve', desc: 'evidence loop + multi-agent shipping', path: 'zer0 / product / evolve', today: true },
    { date: iso(0), name: 'boplog', desc: 'public build log · interaction lab', path: 'zer0 / experiment / boplog', today: true },
    { date: iso(-1), name: 'tmux-agent-fleet', desc: 'zero-daemon agent palette', path: 'zer0 / product / agent tooling' },
    { date: iso(-3), name: 'ace', desc: 'facility twin · racket sports', path: 'zer0 / product / world sim' },
    { date: iso(-12), name: 'AudioEngine', desc: 'old iOS noise meter + EQ', path: 'professional' },
  ];
  let rowsOrb = true;
  let rowsEnter = true;

  function renderRows() {
    if (!demoRows) return;
    demoRows.innerHTML = '';
    SAMPLE.forEach((item, i) => {
      const row = document.createElement('article');
      row.className = 'row' + (rowsEnter && !reduced ? ' is-enter' : '');
      if (rowsEnter) row.style.animationDelay = `${Math.min(i, 8) * 40}ms`;
      const date = document.createElement('div');
      date.className = 'row__date';
      if (item.today && rowsOrb) {
        const c = document.createElement('canvas');
        date.append(c);
        mountOrb(c, { size: 16, state: 'working', speed: 1.1 });
      }
      const time = document.createElement('span');
      time.textContent = item.date;
      date.append(time);
      const main = document.createElement('div');
      main.className = 'row__main';
      main.innerHTML = `<h3>${item.name}</h3><p>${item.desc}</p><div class="row__path">${item.path}</div>`;
      row.append(date, main);
      demoRows.append(row);
    });
  }
  renderRows();

  /* ── 5. lattice + grain ── */
  const lattice = document.querySelector('#lattice');
  const grain = document.querySelector('#grain');
  let latticeOn = true;
  let latticeRaf = 0;
  const nodes = Array.from({ length: 48 }, (_, i) => ({
    x: hashD(i, 1),
    y: hashD(i, 2),
    px: (hashD(i, 3) - 0.5) * 0.012,
    py: (hashD(i, 4) - 0.5) * 0.012,
    phase: hashD(i, 5) * Math.PI * 2,
  }));

  function resizeLattice() {
    if (!lattice) return;
    const parent = lattice.parentElement;
    const w = parent?.clientWidth || 640;
    const h = parent?.clientHeight || 200;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    lattice.width = Math.round(w * dpr);
    lattice.height = Math.round(h * dpr);
    lattice.style.width = `${w}px`;
    lattice.style.height = `${h}px`;
  }

  function drawLattice(t) {
    if (!lattice || !latticeOn) return;
    const ctx = lattice.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = lattice.width / dpr;
    const h = lattice.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const dark = isDark();
    const ink = dark ? 'rgba(243,243,240,' : 'rgba(17,17,17,';
    for (const n of nodes) {
      const ox = Math.sin(t * 0.4 + n.phase) * 6;
      const oy = Math.cos(t * 0.35 + n.phase * 1.3) * 5;
      const x = n.x * w + ox;
      const y = n.y * h + oy;
      ctx.beginPath();
      ctx.fillStyle = `${ink}${0.22 + 0.2 * Math.sin(t + n.phase)})`;
      ctx.arc(x, y, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function latticeLoop() {
    drawLattice(performance.now() / 1000);
    if (latticeOn && !reduced) latticeRaf = requestAnimationFrame(latticeLoop);
  }
  resizeLattice();
  if (!reduced) latticeLoop();
  else drawLattice(0.5);
  window.addEventListener('resize', () => {
    resizeLattice();
    if (reduced || !latticeOn) drawLattice(performance.now() / 1000);
  });

  /* ── 6. scroll rail + pixel stamp ── */
  const rail = document.querySelector('#scroll-rail');
  const railFill = document.querySelector('#scroll-rail-fill');
  let railOn = true;

  function updateRail() {
    if (!rail || !railFill || !railOn) return;
    const el = document.documentElement;
    const max = el.scrollHeight - el.clientHeight;
    const p = max > 0 ? (el.scrollTop || window.scrollY) / max : 0;
    railFill.style.height = `${Math.min(1, Math.max(0, p)) * 100}%`;
  }
  if (rail) rail.hidden = false;
  window.addEventListener('scroll', updateRail, { passive: true });
  updateRail();

  const stamp = document.querySelector('#pixel-stamp');
  let stampOn = true;
  let stampRaf = 0;

  function drawStamp(t) {
    if (!stamp || !stampOn) return;
    const ctx = stamp.getContext('2d');
    if (!ctx) return;
    const N = 16;
    const cell = 48 / N;
    ctx.clearRect(0, 0, 48, 48);
    const dark = isDark();
    const on = dark ? '#efefec' : '#111111';
    const off = dark ? '#1a1a1a' : '#e8e8e2';
    ctx.fillStyle = off;
    ctx.fillRect(0, 0, 48, 48);
    // morphing filled shape in pixel grid
    const phase = (t * 0.25) % 3;
    const shape = Math.floor(phase);
    const blend = phase - shape;
    const inside = (x, y, s) => {
      const nx = (x + 0.5) / N * 2 - 1;
      const ny = (y + 0.5) / N * 2 - 1;
      if (s === 0) return nx * nx + ny * ny < 0.55;
      if (s === 1) return ny > -0.15 && ny < 0.75 * (1 - Math.abs(nx) * 1.2);
      return Math.abs(nx) < 0.55 && Math.abs(ny) < 0.55;
    };
    const next = (shape + 1) % 3;
    ctx.fillStyle = on;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const a = inside(x, y, shape);
        const b = inside(x, y, next);
        if ((a && blend < 0.5) || (b && blend >= 0.5) || (a && b)) {
          // sparse dither on edges during blend
          if (a !== b && hashD(x + t, y) > 0.55) continue;
          ctx.fillRect(x * cell, y * cell, Math.ceil(cell), Math.ceil(cell));
        }
      }
    }
  }

  function stampLoop() {
    drawStamp(performance.now() / 1000);
    if (stampOn && !reduced) stampRaf = requestAnimationFrame(stampLoop);
  }
  if (!reduced) stampLoop();
  else drawStamp(0.5);

  /* ── 7. empty / idle ── */
  const emptyOrbCanvas = document.querySelector('#empty-orb');
  let emptyCtrl = emptyOrbCanvas
    ? mountOrb(emptyOrbCanvas, { size: 40, state: 'listening', speed: 0.55 })
    : null;
  let emptyIdle = true;
  document.querySelector('#empty-toggle')?.addEventListener('click', () => {
    emptyIdle = !emptyIdle;
    emptyCtrl?.setState(emptyIdle ? 'listening' : 'searching');
    const p = document.querySelector('#empty-demo p');
    if (p) p.textContent = emptyIdle ? 'no matches · agents idle' : 'searching archive…';
  });

  /* ── toggles ── */
  document.querySelectorAll('[data-toggle]').forEach((input) => {
    input.addEventListener('change', () => {
      const key = input.dataset.toggle;
      const on = input.checked;
      if (key === 'agents-rotate') agentRotate = on;
      if (key === 'agents-live') agentStrip?.classList.toggle('is-live', on);
      if (key === 'act-pulse') { pulseOn = on; applyPulse(); }
      if (key === 'act-scan') scanOn = on;
      if (key === 'rows-orb') { rowsOrb = on; renderRows(); }
      if (key === 'rows-enter') { rowsEnter = on; renderRows(); }
      if (key === 'lattice') {
        latticeOn = on;
        if (lattice) lattice.style.opacity = on ? '0.55' : '0';
        if (on && !reduced) latticeLoop();
      }
      if (key === 'grain') {
        if (grain) grain.hidden = !on;
      }
      if (key === 'rail') {
        railOn = on;
        if (rail) rail.hidden = !on;
        updateRail();
      }
      if (key === 'stamp') {
        stampOn = on;
        if (on && !reduced) stampLoop();
        else if (!on && stamp) {
          const ctx = stamp.getContext('2d');
          ctx?.clearRect(0, 0, 48, 48);
        }
      }
    });
  });
})();
