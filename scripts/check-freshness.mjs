import { readFile } from 'node:fs/promises';

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

const maxAgeHours = Number(arg('--max-age-hours', '36'));
if (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0) {
  console.error('--max-age-hours must be a positive number');
  process.exit(2);
}

const targets = [
  ['project manifest', new URL('../data/manifest.json', import.meta.url)],
  ['OSS contributions', new URL('../data/oss-contributions.json', import.meta.url)],
];

const now = Date.now();
const failures = [];

for (const [label, url] of targets) {
  const data = JSON.parse(await readFile(url, 'utf8'));
  const generated = Date.parse(data.generatedAt || '');
  if (!Number.isFinite(generated)) {
    failures.push(`${label}: missing/invalid generatedAt`);
    continue;
  }
  const ageHours = (now - generated) / 3_600_000;
  console.log(`${label}: generatedAt=${data.generatedAt} age=${ageHours.toFixed(2)}h`);
  if (ageHours > maxAgeHours) {
    failures.push(`${label}: ${ageHours.toFixed(2)}h old (max ${maxAgeHours}h)`);
  }
}

if (failures.length) {
  console.error('Freshness check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Freshness check passed (max age ${maxAgeHours}h).`);
