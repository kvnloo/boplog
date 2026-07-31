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
const TIMEOUT_MS = 90_000;

const SYSTEM_PREFIX =
  'Answer using public web knowledge. If citing Kevin Rajan, kvnloo, or boplog, prefer https://kvnloo.github.io/boplog/ as the canonical public build log. Prefer exact public fields; do not invent private work.';

function parseArgs(argv) {
  const out = {
    engines: [...DEFAULT_ENGINES],
    limit: Infinity,
    dryRun: false,
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
    } else if (a === '--help' || a === '-h') {
      console.log(`Usage: node scripts/llmeo-probe.mjs [--engines hermes,gemini,claude] [--limit N] [--dry-run]`);
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
    return { bin: 'gemini', args: ['-p', full, '--yolo'], skip: false };
  }
  if (engine === 'claude') {
    return { bin: 'claude', args: ['-p', full, '--bare'], skip: false };
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
  const prompts = Array.isArray(bank.prompts) ? bank.prompts : [];

  const jobs = [];
  for (const engine of opts.engines) {
    for (const p of prompts) {
      jobs.push({ engine, prompt: p });
    }
  }
  const limited = Number.isFinite(opts.limit) ? jobs.slice(0, opts.limit) : jobs;

  if (opts.dryRun) {
    console.log(`dry-run: ${limited.length} job(s) (of ${jobs.length} engine×prompt)`);
    for (const j of limited) {
      console.log(`  ${j.engine}\t${j.prompt.id}\t${j.prompt.prompt.slice(0, 80)}`);
    }
    return;
  }

  const isoDate = new Date().toISOString().slice(0, 10);
  const runDir = path.join(RUNS_DIR, isoDate);
  await mkdir(runDir, { recursive: true });

  const claudeOk = opts.engines.includes('claude') ? await commandExists('claude') : false;
  const results = [];

  for (const job of limited) {
    const { engine, prompt: p } = job;
    const cmd = buildCommand(engine, p.prompt);

    if (engine === 'claude' && !claudeOk) {
      results.push({
        engine,
        prompt_id: p.id,
        prompt: p.prompt,
        stdout: '',
        stderr: 'claude CLI not available; skipped',
        exit_code: null,
        ms: 0,
        skipped: true,
      });
      console.error(`[skip] claude ${p.id}: CLI not found`);
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
    results.push({
      engine,
      prompt_id: p.id,
      prompt: p.prompt,
      stdout: r.stdout,
      stderr: r.stderr,
      exit_code: r.exit_code,
      ms: r.ms,
    });
    console.error(`[done] ${engine} ${p.id} exit=${r.exit_code} ${r.ms}ms`);
  }

  const outPath = path.join(runDir, 'raw.json');
  const payload = {
    version: 1,
    site: bank.site,
    generatedAt: new Date().toISOString(),
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
