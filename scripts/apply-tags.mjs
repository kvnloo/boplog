#!/usr/bin/env node
/**
 * Stamp domains/languages/stack from data/project-tags.json onto year project files.
 * Also derive languages from types when missing.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data');

const LANG_FROM_TYPE = new Set([
  'ts', 'js', 'py', 'sh', 'swift', 'rs', 'c++', 'html', 'tex', 'makefile',
]);

async function main() {
  const taxonomy = JSON.parse(await readFile(path.join(DATA, 'taxonomy.json'), 'utf8'));
  const tags = JSON.parse(await readFile(path.join(DATA, 'project-tags.json'), 'utf8'));
  const domainIds = new Set((taxonomy.domains || []).map((d) => d.id));
  const defaults = tags.defaults || {};
  const byName = tags.projects || {};

  const files = (await readdir(DATA)).filter((f) => /^projects-\d{4}\.json$/.test(f));
  let stamped = 0;

  for (const file of files) {
    const fp = path.join(DATA, file);
    const chunk = JSON.parse(await readFile(fp, 'utf8'));
    const projects = chunk.projects || [];
    for (const p of projects) {
      const override = byName[p.name] || byName[p.id] || {};
      const fromTypes = (p.types || []).filter((t) => LANG_FROM_TYPE.has(t));
      const domains = [...new Set(override.domains || defaults.domains || [])]
        .filter((d) => domainIds.has(d));
      const languages = [...new Set([
        ...(override.languages || defaults.languages || []),
        ...fromTypes,
      ])];
      const stack = [...new Set(override.stack || defaults.stack || [])];
      p.domains = domains;
      p.languages = languages;
      p.stack = stack;
      // Keep categories useful for legacy filters: merge domains + legacy cats
      const cats = new Set([...(p.categories || []).filter((c) => c !== 'dev'), ...domains]);
      if (!cats.size) cats.add('dev');
      p.categories = [...cats];
      stamped += 1;
    }
    await writeFile(fp, `${JSON.stringify(chunk, null, 2)}\n`, 'utf8');
  }
  console.log(`stamped ${stamped} projects across ${files.length} files`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
