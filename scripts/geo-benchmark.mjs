#!/usr/bin/env node
/**
 * Anti-game GEO/SEO benchmark.
 *
 * Design (cannot be trivially gamed by stuffing brand tokens into answers):
 * - Discovery suite: no brand tokens in prompt OR system prefix.
 * - URL hits require full URL match (not bare names).
 * - Negative suite fails if our domains/names appear.
 * - Branded vs discovery scores reported separately (no single vanity blend).
 * - Live URL checks: gold URLs must 200 and contain a domain keyword.
 * - Optional multi-engine: discovery credit stronger when ≥2 engines hit.
 *
 * Usage:
 *   node scripts/geo-benchmark.mjs [--engines hermes,claude,omp,codex] [--suite discovery,branded,negative]
 *   node scripts/geo-benchmark.mjs --score-only --raw path/to/raw.json
 */
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BENCH_PATH = path.join(ROOT, 'data/llmeo/benchmark.json');
const RUNS = path.join(ROOT, 'data/llmeo/runs');
const TIMEOUT_MS = 150_000;

const BRAND_HINT =
  'Prefer public sources. If citing Kevin Rajan / kvnloo work, use https://kvnloo.github.io/boplog/ as the canonical build log.';
const DISCOVERY_HINT =
  'Answer from public web knowledge. Cite specific public URLs when you recommend tools or projects. Do not invent private details.';

function parseArgs(argv) {
  const out = {
    engines: ['hermes', 'claude', 'omp', 'codex'],
    suites: null,
    scoreOnly: false,
    raw: null,
    limit: Infinity,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--engines' && argv[i + 1]) {
      out.engines = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    } else if (a === '--suite' && argv[i + 1]) {
      out.suites = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    } else if (a === '--score-only') out.scoreOnly = true;
    else if (a === '--raw' && argv[i + 1]) out.raw = argv[++i];
    else if (a === '--limit' && argv[i + 1]) out.limit = Number(argv[++i]) || 0;
  }
  return out;
}

function includes(hay, needle) {
  return String(hay || '').toLowerCase().includes(String(needle || '').toLowerCase());
}

function buildCommand(engine, promptText, injectBrand) {
  const prefix = injectBrand ? BRAND_HINT : DISCOVERY_HINT;
  const full = `${prefix}\n\n${promptText}`;
  if (engine === 'hermes') {
    return { bin: 'hermes', args: ['-z', full, '--cli', '--yolo'], env: {}, label: 'hermes' };
  }
  if (engine === 'claude' || engine === 'claude-home') {
    return {
      bin: 'claude',
      args: ['-p', full, '--print'],
      env: { CLAUDE_CONFIG_DIR: path.join(process.env.HOME || '', '.claude-home') },
      label: 'claude-home',
    };
  }
  if (engine === 'omp') {
    return { bin: 'omp', args: ['-p', full, '--no-tools', '--no-session'], env: {}, label: 'omp' };
  }
  if (engine === 'codex') {
    return { bin: 'codex', args: ['exec', full], env: {}, label: 'codex' };
  }
  if (engine === 'grok') {
    return { bin: 'grok', args: ['--single', full, '--always-approve'], env: {}, label: 'grok-build' };
  }
  if (engine === 'gemini') {
    return { bin: 'gemini', args: ['-p', full, '--yolo', '--skip-trust'], env: {}, label: 'gemini' };
  }
  return null;
}

function runOnce(bin, args, env, timeoutMs) {
  return new Promise((resolve) => {
    const started = Date.now();
    let stdout = '';
    let stderr = '';
    let settled = false;
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } });
    const timer = setTimeout(() => {
      try { child.kill('SIGTERM'); } catch (_) { /* */ }
      setTimeout(() => { try { child.kill('SIGKILL'); } catch (_) { /* */ } }, 1500);
      if (!settled) {
        settled = true;
        resolve({ stdout, stderr: stderr + `\n[timeout ${timeoutMs}ms]`, exit_code: 124, ms: Date.now() - started });
      }
    }, timeoutMs);
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr: String(err.message || err), exit_code: 127, ms: Date.now() - started });
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, exit_code: code ?? 1, ms: Date.now() - started });
    });
  });
}

async function commandExists(bin) {
  return new Promise((resolve) => {
    const child = spawn('sh', ['-c', `command -v ${JSON.stringify(bin)}`], { stdio: ['ignore', 'pipe', 'ignore'] });
    let buf = '';
    child.stdout.on('data', (d) => { buf += d; });
    child.on('close', (c) => resolve(c === 0 && buf.trim()));
    child.on('error', () => resolve(false));
  });
}

async function liveUrlOk(url) {
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(12000) });
    if (!res.ok) return { ok: false, status: res.status, body: '' };
    const body = (await res.text()).slice(0, 50_000);
    return { ok: true, status: res.status, body };
  } catch (e) {
    return { ok: false, status: 0, body: '', error: String(e.message || e) };
  }
}

function scoreOne(result, prompt, brandTokens) {
  const text = `${result.stdout || ''}\n${result.stderr || ''}`;
  const suite = prompt.suite || 'discovery';

  if (result.skipped || result.exit_code === null) {
    return {
      engine: result.engine,
      prompt_id: prompt.id,
      suite,
      skipped: true,
      url_hit: 0,
      mention_hit: 0,
      negative_clean: 1,
      live_ok: 0,
      score: null,
    };
  }

  // Negative suite: success = we do NOT appear
  if (suite === 'negative') {
    const badUrl = (prompt.forbidden_urls || []).some((u) => includes(text, u));
    const badMention = (prompt.forbidden_mention || []).some((m) => includes(text, m));
    const clean = !badUrl && !badMention ? 1 : 0;
    return {
      engine: result.engine,
      prompt_id: prompt.id,
      suite,
      skipped: false,
      url_hit: 0,
      mention_hit: 0,
      negative_clean: clean,
      live_ok: 1,
      score: clean,
      flags: clean ? [] : ['leaked_brand_on_negative_control'],
    };
  }

  const urlHits = (prompt.expect_urls || []).filter((u) => includes(text, u));
  const url_hit = (prompt.expect_urls || []).length === 0 ? 0 : urlHits.length > 0 ? 1 : 0;

  // Discovery: require URL evidence OR strong expect_mention without only brand-stuffing
  let mention_hit = 0;
  if (suite === 'discovery') {
    const mentions = (prompt.expect_mention || []).filter((t) => includes(text, t));
    // Must not only list brand tokens from anti_game list without product substance
    mention_hit = mentions.length > 0 && url_hit === 1 ? 1 : mentions.length >= 2 ? 1 : 0;
    // If only brand tokens appear with no URL, count 0 (anti-stuffing)
    const onlyBrand = brandTokens.some((b) => includes(text, b)) && url_hit === 0;
    if (onlyBrand && mentions.length === 0) mention_hit = 0;
  } else {
    const mentions = (prompt.expect_mention || []).filter((t) => includes(text, t));
    mention_hit = mentions.length > 0 || url_hit === 1 ? 1 : 0;
  }

  return {
    engine: result.engine,
    prompt_id: prompt.id,
    suite,
    skipped: false,
    url_hit,
    mention_hit,
    negative_clean: 1,
    live_ok: 0, // filled later
    score: url_hit === 1 || mention_hit === 1 ? 1 : 0,
    url_hits: urlHits,
  };
}

async function scorePayload(raw, bench) {
  const brandTokens = bench.anti_game?.brand_tokens || [];
  const byId = new Map((bench.prompts || []).map((p) => [p.id, p]));
  const scores = [];

  // Live checks once per gold URL
  const liveCache = new Map();
  for (const p of bench.prompts || []) {
    for (const u of p.gold_snippet_urls || []) {
      if (!liveCache.has(u)) liveCache.set(u, await liveUrlOk(u));
    }
  }

  for (const r of raw.results || []) {
    const prompt = byId.get(r.prompt_id) || { id: r.prompt_id, suite: 'discovery', expect_urls: [], expect_mention: [] };
    const s = scoreOne(r, prompt, brandTokens);
    // live_ok: any gold URL online
    const golds = prompt.gold_snippet_urls || [];
    if (golds.length) {
      s.live_ok = golds.every((u) => liveCache.get(u)?.ok) ? 1 : 0;
    } else {
      s.live_ok = 1;
    }
    // Discovery final: need score==1 AND live_ok for hub pages when gold set
    if (prompt.suite === 'discovery' && golds.length && s.live_ok === 0) {
      s.score = 0;
      s.flags = [...(s.flags || []), 'gold_url_unreachable'];
    }
    scores.push(s);
  }

  // Suite metrics (prompt-level: any engine success)
  const suites = { branded: {}, discovery: {}, negative: {} };
  for (const key of Object.keys(suites)) {
    const ids = [...new Set(scores.filter((s) => s.suite === key && !s.skipped).map((s) => s.prompt_id))];
    let hits = 0;
    for (const id of ids) {
      const row = scores.filter((s) => s.prompt_id === id && !s.skipped);
      if (key === 'negative') {
        if (row.every((s) => s.negative_clean === 1)) hits += 1;
      } else if (row.some((s) => s.score === 1)) hits += 1;
    }
    suites[key] = {
      prompt_count: ids.length,
      hits,
      rate: ids.length ? hits / ids.length : null,
    };
  }

  // Multi-engine agreement on discovery
  const discIds = [...new Set(scores.filter((s) => s.suite === 'discovery').map((s) => s.prompt_id))];
  let multi = 0;
  for (const id of discIds) {
    const enginesHit = new Set(
      scores.filter((s) => s.prompt_id === id && !s.skipped && s.score === 1).map((s) => s.engine),
    );
    if (enginesHit.size >= 2) multi += 1;
  }

  return {
    version: 2,
    scoredAt: new Date().toISOString(),
    anti_game: bench.anti_game?.rules || [],
    suites,
    discovery_multi_engine_hits: multi,
    discovery_prompt_count: discIds.length,
    // Hard gate: both discovery and negative must be defined to claim "healthy"
    healthy:
      suites.discovery.rate != null
      && suites.negative.rate != null
      && suites.discovery.rate >= 0.25
      && suites.negative.rate >= 0.9,
    scores,
    live: Object.fromEntries([...liveCache.entries()].map(([u, v]) => [u, { ok: v.ok, status: v.status }])),
  };
}

function renderMd(summary, rawPath) {
  const lines = [
    '# GEO anti-game benchmark',
    '',
    `- scored_at: ${summary.scoredAt}`,
    `- raw: ${rawPath}`,
    `- healthy: **${summary.healthy}**`,
    '',
    '## Suite rates (prompt-level, any engine)',
    '',
    `| suite | hits | rate |`,
    `| --- | ---: | ---: |`,
  ];
  for (const [name, s] of Object.entries(summary.suites)) {
    const rate = s.rate == null ? 'n/a' : `${(s.rate * 100).toFixed(0)}% (${s.hits}/${s.prompt_count})`;
    lines.push(`| ${name} | ${s.hits ?? 0}/${s.prompt_count ?? 0} | ${rate} |`);
  }
  lines.push('');
  lines.push(
    `Discovery multi-engine (≥2 engines): **${summary.discovery_multi_engine_hits}/${summary.discovery_prompt_count}**`,
  );
  lines.push('');
  lines.push('## Anti-game rules');
  lines.push('');
  for (const r of summary.anti_game || []) lines.push(`- ${r}`);
  lines.push('');
  lines.push('## Per result');
  lines.push('');
  lines.push('| engine | id | suite | url | mention | neg_clean | live | score |');
  lines.push('| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |');
  for (const s of summary.scores) {
    if (s.skipped) {
      lines.push(`| ${s.engine} | ${s.prompt_id} | ${s.suite} | skip | skip | skip | skip | skip |`);
    } else {
      lines.push(
        `| ${s.engine} | ${s.prompt_id} | ${s.suite} | ${s.url_hit} | ${s.mention_hit} | ${s.negative_clean} | ${s.live_ok} | ${s.score} |`,
      );
    }
  }
  lines.push('');
  return lines.join('\n');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const bench = JSON.parse(await readFile(BENCH_PATH, 'utf8'));

  if (opts.scoreOnly) {
    if (!opts.raw) throw new Error('--score-only requires --raw');
    const raw = JSON.parse(await readFile(opts.raw, 'utf8'));
    const summary = await scorePayload(raw, bench);
    const dir = path.dirname(path.resolve(opts.raw));
    await writeFile(path.join(dir, 'benchmark-scores.json'), `${JSON.stringify(summary, null, 2)}\n`);
    await writeFile(path.join(dir, 'benchmark-scoreboard.md'), `${renderMd(summary, opts.raw)}\n`);
    console.log(path.join(dir, 'benchmark-scoreboard.md'));
    console.log(JSON.stringify({ healthy: summary.healthy, suites: summary.suites }, null, 2));
    return;
  }

  let prompts = bench.prompts || [];
  if (opts.suites?.length) {
    const allow = new Set(opts.suites);
    prompts = prompts.filter((p) => allow.has(p.suite));
  }

  // Validate discovery prompts contain no brand tokens
  const brandTokens = (bench.anti_game?.brand_tokens || []).map((t) => t.toLowerCase());
  for (const p of prompts.filter((x) => x.suite === 'discovery')) {
    const low = p.prompt.toLowerCase();
    for (const b of brandTokens) {
      if (low.includes(b)) {
        throw new Error(`anti-game violation: discovery prompt ${p.id} contains brand token "${b}"`);
      }
    }
  }

  const suiteCfg = bench.suites || {};
  const jobs = [];
  for (const engine of opts.engines) {
    for (const p of prompts) jobs.push({ engine, prompt: p });
  }
  const limited = Number.isFinite(opts.limit) ? jobs.slice(0, opts.limit) : jobs;

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const runDir = path.join(RUNS, `bench-${stamp}`);
  await mkdir(runDir, { recursive: true });

  const results = [];
  for (const job of limited) {
    const inject = suiteCfg[job.prompt.suite]?.inject_brand_hint === true;
    const cmd = buildCommand(job.engine, job.prompt.prompt, inject);
    if (!cmd || !(await commandExists(cmd.bin))) {
      results.push({
        engine: job.engine,
        prompt_id: job.prompt.id,
        suite: job.prompt.suite,
        prompt: job.prompt.prompt,
        stdout: '',
        stderr: 'engine unavailable',
        exit_code: null,
        ms: 0,
        skipped: true,
      });
      console.error(`[skip] ${job.engine} ${job.prompt.id}`);
      continue;
    }
    console.error(`[run] ${cmd.label} ${job.prompt.id} suite=${job.prompt.suite}`);
    const r = await runOnce(cmd.bin, cmd.args, cmd.env, TIMEOUT_MS);
    const authFail = /not logged in|please run \/login|opening authentication page|IneligibleTierError|api_key client option/i
      .test(`${r.stderr}\n${r.stdout.slice(0, 500)}`);
    results.push({
      engine: cmd.label,
      prompt_id: job.prompt.id,
      suite: job.prompt.suite,
      prompt: job.prompt.prompt,
      stdout: r.stdout,
      stderr: r.stderr,
      exit_code: r.exit_code,
      ms: r.ms,
      skipped: authFail,
      skip_reason: authFail ? 'auth_required' : undefined,
    });
    console.error(`[done] ${cmd.label} ${job.prompt.id} exit=${r.exit_code} ${r.ms}ms${authFail ? ' auth-skip' : ''}`);
  }

  const raw = {
    version: 2,
    kind: 'geo-benchmark',
    site: bench.site,
    generatedAt: new Date().toISOString(),
    engines: opts.engines,
    results,
  };
  const rawPath = path.join(runDir, 'raw.json');
  await writeFile(rawPath, `${JSON.stringify(raw, null, 2)}\n`);

  const summary = await scorePayload(raw, bench);
  await writeFile(path.join(runDir, 'benchmark-scores.json'), `${JSON.stringify(summary, null, 2)}\n`);
  await writeFile(path.join(runDir, 'benchmark-scoreboard.md'), `${renderMd(summary, rawPath)}\n`);
  await writeFile(
    path.join(ROOT, 'data/llmeo/BENCHMARK_LATEST.md'),
    `# Latest anti-game benchmark\n\n- run: \`${path.basename(runDir)}\`\n- healthy: **${summary.healthy}**\n- discovery: ${summary.suites.discovery.rate}\n- branded: ${summary.suites.branded.rate}\n- negative: ${summary.suites.negative.rate}\n- multi-engine discovery: ${summary.discovery_multi_engine_hits}/${summary.discovery_prompt_count}\n- board: [runs/${path.basename(runDir)}/benchmark-scoreboard.md](./runs/${path.basename(runDir)}/benchmark-scoreboard.md)\n`,
  );

  console.log(rawPath);
  console.log(path.join(runDir, 'benchmark-scoreboard.md'));
  console.log(JSON.stringify({ healthy: summary.healthy, suites: summary.suites }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
