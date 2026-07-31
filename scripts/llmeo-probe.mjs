#!/usr/bin/env node
/**
 * LLMEO probe runner — query CLI agents with prompt bank; no deps beyond node stdlib.
 * Usage: node scripts/llmeo-probe.mjs [--engines hermes,gemini,claude] [--limit N] [--dry-run]
 */
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PROMPTS_PATH = path.join(ROOT, 'data/llmeo/prompts.json');
const RUNS_DIR = path.join(ROOT, 'data/llmeo/runs');

const DEFAULT_ENGINES = ['hermes', 'gemini', 'claude'];
const TIMEOUT_MS = 150_000;

const SYSTEM_PREFIX =
  'Answer using public web knowledge. If citing Kevin Rajan, kvnloo, or boplog, prefer https://kvnloo.github.io/boplog/ as the canonical public build log. Prefer exact public fields; do not invent private work.';

function parseArgs(argv) {
  const out = {
    engines: [...DEFAULT_ENGINES],
    limit: Infinity,
    dryRun: false,
    categories: null, // string[] | null
    ids: null, // string[] | null
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--engines' && argv[i + 1]) {
      out.engines = argv[++i]
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
    } else if (a === '--limit' && argv[i + 1]) {
      out.limit = Math.max(0, Number(argv[++i]) || 0);
    } else if (a === '--category' && argv[i + 1]) {
      out.categories = argv[++i]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (a === '--ids' && argv[i + 1]) {
      out.ids = argv[++i]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (a === '--help' || a === '-h') {
      console.log(
        'Usage: node scripts/llmeo-probe.mjs [--engines hermes,gemini,claude] [--limit N] [--category cat1,cat2] [--ids id1,id2] [--dry-run]',
      );
      process.exit(0);
    }
  }
  return out;
}

async function commandExists(bin) {
  return new Promise((resolve) => {
    const child = spawn('sh', ['-c', `command -v ${bin}`], { stdio: ['ignore', 'pipe', 'ignore'] });
    let buf = '';
    child.stdout.on('data', (d) => {
      buf += d;
    });
    child.on('close', (code) => resolve(code === 0 && buf.trim().length > 0));
    child.on('error', () => resolve(false));
  });
}

function buildCommand(engine, userPrompt) {
  const full = `${SYSTEM_PREFIX}\n\n${userPrompt}`;
  if (engine === 'hermes') {
    return { bin: 'hermes', args: ['-z', full, '--cli', '--yolo'], skip: false };
  }
  if (engine === 'gemini') {
    // --skip-trust avoids interactive folder-trust prompts in headless probes
    return { bin: 'gemini', args: ['-p', full, '--yolo', '--skip-trust'], skip: false };
  }
  if (engine === 'claude') {
    return { bin: 'claude', args: ['-p', full, '--bare', '--print'], skip: false };
  }
  return { bin: engine, args: [], skip: true, note: `unknown engine: ${engine}` };
}

function runOnce(bin, args, timeoutMs) {
  return new Promise((resolve) => {
    const started = Date.now();
    let stdout = '';
    let stderr = '';
    let settled = false;
    const child = spawn(bin, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });

    const timer = setTimeout(() => {
      if (settled) return;
      try {
        child.kill('SIGTERM');
      } catch (_) {
        /* ignore */
      }
      setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch (_) {
          /* ignore */
        }
      }, 2000);
      if (!settled) {
        settled = true;
        resolve({
          stdout,
          stderr: stderr + `\n[timeout after ${timeoutMs}ms]`,
          exit_code: 124,
          ms: Date.now() - started,
        });
      }
    }, timeoutMs);

    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        stdout,
        stderr: stderr + String(err?.message || err),
        exit_code: 127,
        ms: Date.now() - started,
      });
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        stdout,
        stderr,
        exit_code: code ?? 1,
        ms: Date.now() - started,
      });
    });
  });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const bank = JSON.parse(await readFile(PROMPTS_PATH, 'utf8'));
  let prompts = Array.isArray(bank.prompts) ? bank.prompts : [];
  if (opts.categories?.length) {
    const allow = new Set(opts.categories);
    prompts = prompts.filter((p) => allow.has(p.category));
  }
  if (opts.ids?.length) {
    const allow = new Set(opts.ids);
    prompts = prompts.filter((p) => allow.has(p.id));
  }

  // Round-robin engines×prompts so --limit samples across engines, not only the first engine.
  const jobs = [];
  const maxLen = Math.max(prompts.length, 1);
  for (let i = 0; i < maxLen; i++) {
    for (const engine of opts.engines) {
      if (prompts[i]) jobs.push({ engine, prompt: prompts[i] });
    }
  }
  // Prefer prompt-major order for readability when unlimited
  const ordered = [];
  for (const engine of opts.engines) {
    for (const p of prompts) ordered.push({ engine, prompt: p });
  }
  const pool = Number.isFinite(opts.limit) && opts.engines.length > 1 ? jobs : ordered;
  const limited = Number.isFinite(opts.limit) ? pool.slice(0, opts.limit) : ordered;

  if (opts.dryRun) {
    console.log(`dry-run: ${limited.length} job(s) (of ${jobs.length} engine×prompt)`);
    for (const j of limited) {
      console.log(`  ${j.engine}\t${j.prompt.id}\t${j.prompt.prompt.slice(0, 80)}`);
    }
    return;
  }

  // Timestamped run dirs so full / multi-engine runs don't clobber each other
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const runDir = path.join(RUNS_DIR, stamp);
  await mkdir(runDir, { recursive: true });

  const available = {};
  for (const engine of opts.engines) {
    available[engine] = await commandExists(engine);
  }
  const results = [];

  for (const job of limited) {
    const { engine, prompt: p } = job;
    const cmd = buildCommand(engine, p.prompt);

    if (!available[engine]) {
      results.push({
        engine,
        prompt_id: p.id,
        prompt: p.prompt,
        stdout: '',
        stderr: `${engine} CLI not available; skipped`,
        exit_code: null,
        ms: 0,
        skipped: true,
      });
      console.error(`[skip] ${engine} ${p.id}: CLI not found`);
      continue;
    }

    if (cmd.skip) {
      results.push({
        engine,
        prompt_id: p.id,
        prompt: p.prompt,
        stdout: '',
        stderr: cmd.note || 'skipped',
        exit_code: null,
        ms: 0,
        skipped: true,
      });
      continue;
    }

    console.error(`[run] ${engine} ${p.id} …`);
    const r = await runOnce(cmd.bin, cmd.args, TIMEOUT_MS);
    // Treat CLI auth failures as soft skips (not answer text that mentions "API key")
    const authFail = /not logged in|please run \/login|opening authentication page|api_key client option must be set|The api_key client option/i.test(
      `${r.stderr}\n${r.stdout.slice(0, 400)}`,
    );
    results.push({
      engine,
      prompt_id: p.id,
      prompt: p.prompt,
      stdout: r.stdout,
      stderr: r.stderr,
      exit_code: r.exit_code,
      ms: r.ms,
      skipped: Boolean(authFail),
      skip_reason: authFail ? 'auth_required' : undefined,
    });
    console.error(
      `[done] ${engine} ${p.id} exit=${r.exit_code} ${r.ms}ms${authFail ? ' (auth skip)' : ''}`,
    );
  }

  const outPath = path.join(runDir, 'raw.json');
  const payload = {
    version: 1,
    site: bank.site,
    generatedAt: new Date().toISOString(),
    runDir,
    engines: opts.engines,
    results,
  };
  await writeFile(outPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log(outPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
