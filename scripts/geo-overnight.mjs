#!/usr/bin/env node
/**
 * Overnight GEO/SEO loop (host-side; workflows cannot sleep).
 *
 * Each round:
 *  1) apply-tags + build-topics
 *  2) anti-game benchmark (selected engines)
 *  3) append round summary
 *  4) optional: commit if --commit (never force-push)
 *
 * Usage:
 *   node scripts/geo-overnight.mjs --hours 8 --engines hermes,claude,omp,codex --round-minutes 45
 *   node scripts/geo-overnight.mjs --rounds 3 --engines hermes,claude
 */
import { spawn } from 'node:child_process';
import { mkdir, appendFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const out = {
    hours: 0,
    rounds: 3,
    engines: 'hermes,claude,omp,codex',
    roundMinutes: 40,
    commit: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--hours' && argv[i + 1]) out.hours = Number(argv[++i]) || 0;
    else if (a === '--rounds' && argv[i + 1]) out.rounds = Number(argv[++i]) || 1;
    else if (a === '--engines' && argv[i + 1]) out.engines = argv[++i];
    else if (a === '--round-minutes' && argv[i + 1]) out.roundMinutes = Number(argv[++i]) || 40;
    else if (a === '--commit') out.commit = true;
  }
  if (out.hours > 0) {
    out.rounds = Math.max(1, Math.floor((out.hours * 60) / out.roundMinutes));
  }
  return out;
}

function run(cmd, args, timeoutMs = 0) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timer;
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        try { child.kill('SIGTERM'); } catch (_) { /* */ }
        if (!settled) {
          settled = true;
          resolve({ code: 124, stdout, stderr: stderr + '\n[timeout]' });
        }
      }, timeoutMs);
    }
    child.stdout.on('data', (d) => { stdout += d; process.stdout.write(d); });
    child.stderr.on('data', (d) => { stderr += d; process.stderr.write(d); });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const logDir = path.join(ROOT, 'data/llmeo/overnight', stamp);
  await mkdir(logDir, { recursive: true });
  const logPath = path.join(logDir, 'log.md');
  await writeFile(
    logPath,
    `# GEO overnight ${stamp}\n\nengines=${opts.engines} rounds=${opts.rounds} roundMinutes=${opts.roundMinutes}\n\n`,
  );

  console.error(`[overnight] ${opts.rounds} rounds → ${logDir}`);

  for (let i = 1; i <= opts.rounds; i++) {
    const header = `\n## Round ${i}/${opts.rounds} — ${new Date().toISOString()}\n\n`;
    await appendFile(logPath, header);
    console.error(header);

    let r = await run('node', ['scripts/apply-tags.mjs']);
    await appendFile(logPath, `### apply-tags exit ${r.code}\n\`\`\`\n${r.stdout.slice(-500)}\n\`\`\`\n`);
    r = await run('node', ['scripts/build-topics.mjs']);
    await appendFile(logPath, `### build-topics exit ${r.code}\n\`\`\`\n${r.stdout.slice(-500)}\n\`\`\`\n`);
    r = await run('npm', ['run', 'check']);
    await appendFile(logPath, `### check exit ${r.code}\n`);

    // Full anti-game benchmark (long)
    r = await run(
      'node',
      ['scripts/geo-benchmark.mjs', '--engines', opts.engines],
      opts.roundMinutes * 60_000,
    );
    await appendFile(
      logPath,
      `### benchmark exit ${r.code}\n\`\`\`\n${r.stdout.slice(-1500)}\n${r.stderr.slice(-800)}\n\`\`\`\n`,
    );

    if (opts.commit && r.code === 0) {
      await run('git', ['add', 'data/', 'topics/', 'sitemap.xml', 'llms.txt', 'index.html', 'scripts/', 'styles.css', 'package.json']);
      await run('git', ['commit', '-m', `chore(geo): overnight round ${i} benchmark snapshot`, '--allow-empty']);
      await run('git', ['push', 'origin', 'HEAD']);
    }

    if (i < opts.rounds) {
      const waitMs = Math.max(60_000, opts.roundMinutes * 60_000 * 0.15);
      console.error(`[overnight] sleeping ${Math.round(waitMs / 1000)}s before next round`);
      await sleep(waitMs);
    }
  }

  await appendFile(logPath, `\n## Done ${new Date().toISOString()}\n`);
  console.error(`[overnight] complete → ${logPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
