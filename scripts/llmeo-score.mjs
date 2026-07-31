#!/usr/bin/env node
/**
 * Score LLMEO probe raw.json → scoreboard.md + scores.json
 * Usage: node scripts/llmeo-score.mjs [path-to-raw.json | path-to-run-dir]
 */
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PROMPTS_PATH = path.join(ROOT, 'data/llmeo/prompts.json');
const RUNS_DIR = path.join(ROOT, 'data/llmeo/runs');

const HALLUCINATION_PATTERNS = [
  /\braised\s+\$[\d.,]+\s*(m|million|b|billion)/i,
  /\bseries\s+[a-c]\b/i,
  /\bprivate\s+repos?\s+are\s+included\b/i,
  /\bincludes?\s+private\s+(github\s+)?repos?/i,
  /\bheadcount\s+of\s+\d{2,}/i,
  /\b\d{2,}\s+employees\b/i,
  /\bfunded\s+by\s+(sequoia|a16z|andreessen)/i,
];

function includesTerm(text, term) {
  if (!text || !term) return false;
  const hay = text.toLowerCase();
  const needle = term.toLowerCase();
  return hay.includes(needle);
}

function scoreResult(result, promptMeta, entityTerms) {
  const text = `${result.stdout || ''}\n${result.stderr || ''}`;
  const expectMention = promptMeta?.expect_mention || [];
  const expectUrls = promptMeta?.expect_urls || [];

  const mentioned_expect = expectMention.filter((t) => includesTerm(text, t));
  const mentioned_entity = entityTerms.filter((t) => includesTerm(text, t));
  const mentioned_urls = expectUrls.filter((u) => includesTerm(text, u));

  const mention_hit = mentioned_expect.length > 0 || mentioned_entity.length > 0 ? 1 : 0;
  const url_hit = expectUrls.length === 0 ? 1 : mentioned_urls.length > 0 ? 1 : 0;

  const halluc_flags = HALLUCINATION_PATTERNS.filter((re) => re.test(text)).map((re) => re.source);
  // Funding / private-inclusion traps: reward answers that avoid false private claims
  let no_hallucination = 1;
  if (promptMeta?.category === 'accuracy_trap') {
    if (halluc_flags.length > 0) no_hallucination = 0;
    // For private-repos / forks traps, penalize claiming private or all forks are included
    if (/accuracy-private|accuracy-forks|accuracy-funding/.test(promptMeta.id || '')) {
      if (/\byes,?\s+(private|all forks)/i.test(text) && /include/i.test(text)) {
        no_hallucination = 0;
      }
      if (promptMeta.id === 'accuracy-funding' && /\$[\d.,]+\s*(m|million)/i.test(text) && !/not (publicly )?(known|disclosed)|no public|unknown|cannot find/i.test(text)) {
        no_hallucination = 0;
      }
    }
  } else if (halluc_flags.length > 0) {
    no_hallucination = 0;
  }

  return {
    engine: result.engine,
    prompt_id: result.prompt_id,
    skipped: Boolean(result.skipped) || result.exit_code === null,
    mention_hit,
    url_hit,
    no_hallucination,
    mentioned_expect,
    mentioned_entity,
    mentioned_urls,
    halluc_flags,
    exit_code: result.exit_code,
    ms: result.ms,
  };
}

async function resolveRawPath(arg) {
  if (!arg) {
    // latest run dir with raw.json
    let names = [];
    try {
      names = await readdir(RUNS_DIR);
    } catch {
      throw new Error(`No runs under ${RUNS_DIR}`);
    }
    const dirs = [];
    for (const n of names.sort().reverse()) {
      const p = path.join(RUNS_DIR, n);
      try {
        const s = await stat(p);
        if (s.isDirectory()) dirs.push(p);
      } catch {
        /* ignore */
      }
    }
    for (const d of dirs) {
      const raw = path.join(d, 'raw.json');
      try {
        await stat(raw);
        return raw;
      } catch {
        /* try next */
      }
    }
    throw new Error('No raw.json found in data/llmeo/runs/*');
  }
  const abs = path.isAbsolute(arg) ? arg : path.resolve(process.cwd(), arg);
  const s = await stat(abs);
  if (s.isDirectory()) return path.join(abs, 'raw.json');
  return abs;
}

function renderMarkdown(scores, meta) {
  const lines = [];
  lines.push(`# LLMEO scoreboard`);
  lines.push('');
  lines.push(`- site: ${meta.site || ''}`);
  lines.push(`- scored_at: ${meta.scoredAt}`);
  lines.push(`- source: ${meta.source}`);
  lines.push(`- results: ${scores.length}`);
  lines.push(`- share_of_voice: ${(meta.share_of_voice * 100).toFixed(1)}%`);
  lines.push('');
  lines.push(`| engine | prompt_id | mention | url | no_halluc |`);
  lines.push(`| --- | --- | ---: | ---: | ---: |`);
  for (const s of scores) {
    if (s.skipped) {
      lines.push(`| ${s.engine} | ${s.prompt_id} | skip | skip | skip |`);
    } else {
      lines.push(`| ${s.engine} | ${s.prompt_id} | ${s.mention_hit} | ${s.url_hit} | ${s.no_hallucination} |`);
    }
  }
  lines.push('');
  lines.push('## Share of voice');
  lines.push('');
  lines.push(
    `Fraction of unique prompts with any correct entity mention across any engine: **${(meta.share_of_voice * 100).toFixed(1)}%** (${meta.prompts_with_mention}/${meta.prompt_count}).`
  );
  lines.push('');
  return lines.join('\n');
}

async function main() {
  const rawPath = await resolveRawPath(process.argv[2]);
  const bank = JSON.parse(await readFile(PROMPTS_PATH, 'utf8'));
  const byId = new Map((bank.prompts || []).map((p) => [p.id, p]));
  const entityTerms = bank.entity_terms || [];

  const raw = JSON.parse(await readFile(rawPath, 'utf8'));
  const results = raw.results || [];
  const scores = results.map((r) => scoreResult(r, byId.get(r.prompt_id), entityTerms));

  // share_of_voice = fraction of prompts with any correct entity mention across any engine
  const promptIds = [...new Set(results.map((r) => r.prompt_id))];
  let withMention = 0;
  for (const id of promptIds) {
    const any = scores.some((s) => s.prompt_id === id && !s.skipped && s.mention_hit === 1);
    if (any) withMention += 1;
  }
  const share_of_voice = promptIds.length ? withMention / promptIds.length : 0;

  const runDir = path.dirname(rawPath);
  const scoredAt = new Date().toISOString();
  const meta = {
    site: raw.site || bank.site,
    source: rawPath,
    scoredAt,
    share_of_voice,
    prompts_with_mention: withMention,
    prompt_count: promptIds.length,
  };

  const scoresPayload = {
    version: 1,
    ...meta,
    scores,
  };

  const scoresPath = path.join(runDir, 'scores.json');
  const boardPath = path.join(runDir, 'scoreboard.md');
  await writeFile(scoresPath, JSON.stringify(scoresPayload, null, 2) + '\n', 'utf8');
  await writeFile(boardPath, renderMarkdown(scores, meta) + '\n', 'utf8');

  // Pointer for humans / CI
  const runName = path.basename(runDir);
  const engines = [...new Set(scores.map((s) => s.engine))].join(', ');
  const latest = [
    '# LLMEO latest run',
    '',
    `- **run**: [${runName}](./runs/${runName}/)`,
    `- **scoreboard**: [runs/${runName}/scoreboard.md](./runs/${runName}/scoreboard.md)`,
    `- **scores**: [runs/${runName}/scores.json](./runs/${runName}/scores.json)`,
    `- **scored_at**: ${scoredAt}`,
    `- **site**: ${meta.site || ''}`,
    `- **share_of_voice**: **${(share_of_voice * 100).toFixed(1)}%** (${withMention}/${promptIds.length} prompts with entity mention)`,
    `- **engines scored**: ${engines || 'none'}`,
    '',
  ].join('\n');
  await writeFile(path.join(ROOT, 'data/llmeo/LATEST.md'), `${latest}\n`, 'utf8');

  console.log(scoresPath);
  console.log(boardPath);
  console.log(`share_of_voice=${(share_of_voice * 100).toFixed(1)}%`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
