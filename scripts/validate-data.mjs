import { readFile } from 'node:fs/promises';
import process from 'node:process';

const dataDir = new URL('../data/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', dataDir), 'utf8'));
const chunks = await Promise.all((manifest.files || []).map(async (file) => {
  const chunk = JSON.parse(await readFile(new URL(file, dataDir), 'utf8'));
  return chunk.projects || [];
}));
const payload = { ...manifest, projects: chunks.flat() };
const errors = [];

const contributionPayload = JSON.parse(await readFile(new URL('contributions.json', dataDir), 'utf8'));
const contributionIds = new Set();
const validStatuses = new Set(['merged', 'open', 'draft', 'closed']);
const validRelationships = new Set(['canonical_upstream', 'contributor_fork', 'owned_repository']);
if (!Array.isArray(contributionPayload.contributions)) {
  errors.push('contributions must be an array');
} else {
  for (const [index, item] of contributionPayload.contributions.entries()) {
    const prefix = `contributions[${index}]`;
    for (const field of ['id', 'repository', 'title', 'url', 'factsSource']) {
      if (typeof item[field] !== 'string' || !item[field].trim()) errors.push(`${prefix}.${field} is required`);
    }
    if (contributionIds.has(item.id)) errors.push(`${prefix}.id is duplicated: ${item.id}`);
    contributionIds.add(item.id);
    if (!Number.isInteger(item.number) || item.number < 1) errors.push(`${prefix}.number must be a positive integer`);
    if (!validStatuses.has(item.status)) errors.push(`${prefix}.status is invalid`);
    if (!validRelationships.has(item.relationship)) errors.push(`${prefix}.relationship is invalid`);
    if (item.factsSource !== 'github') errors.push(`${prefix}.factsSource must be github`);
    if (!/^https:\/\/github\.com\/.+\/pull\/\d+$/.test(item.url)) errors.push(`${prefix}.url must link to a GitHub pull request`);
    if (item.impactReceipt) {
      if (item.status !== 'merged') errors.push(`${prefix} cannot claim impact unless status is merged`);
      if (item.impactReceipt.kind !== 'verified_impact') errors.push(`${prefix}.impactReceipt.kind must be verified_impact`);
      if (typeof item.impactReceipt.summary !== 'string' || !item.impactReceipt.summary.trim()) errors.push(`${prefix}.impactReceipt.summary is required`);
      if (!/^https:\/\//.test(item.impactReceipt.evidenceUrl || '')) errors.push(`${prefix}.impactReceipt.evidenceUrl must be HTTPS`);
    }
  }
}

if (!Array.isArray(manifest.files) || !manifest.files.length) errors.push('manifest.files must be a non-empty array');
if (!Array.isArray(payload.projects)) {
  errors.push('projects must be an array');
} else {
  const ids = new Set();
  for (const [index, project] of payload.projects.entries()) {
    const prefix = `projects[${index}]`;
    for (const field of ['id', 'name', 'description', 'date', 'url']) {
      if (typeof project[field] !== 'string' || !project[field].trim()) errors.push(`${prefix}.${field} is required`);
    }
    if (ids.has(project.id)) errors.push(`${prefix}.id is duplicated: ${project.id}`);
    ids.add(project.id);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(project.date)) errors.push(`${prefix}.date must use YYYY-MM-DD`);
    if (!/^https:\/\//.test(project.url)) errors.push(`${prefix}.url must be HTTPS`);
    if (!Array.isArray(project.types) || !project.types.includes('public')) errors.push(`${prefix} is not explicitly public`);
    for (const field of ['types', 'formats', 'categories']) {
      if (!Array.isArray(project[field])) errors.push(`${prefix}.${field} must be an array`);
    }
    // Hierarchy is optional: company → kind (product|experiment|professional) → product → project.
    // portfolio/portfolioName remain as aliases of kind for older clients.
    for (const field of [
      'company', 'kind', 'portfolio', 'product',
      'companyName', 'kindName', 'portfolioName', 'productName',
    ]) {
      if (project[field] != null && typeof project[field] !== 'string') {
        errors.push(`${prefix}.${field} must be a string when present`);
      }
    }
  }

  const featured = payload.projects.filter((project) => project.featured);
  if (featured.length < 1 || featured.length > 12) {
    errors.push(`featured project count must be between 1 and 12; found ${featured.length}`);
  }
  const ranks = featured.map((project) => project.featuredRank).filter(Number.isFinite);
  if (new Set(ranks).size !== ranks.length) errors.push('featuredRank values must be unique');
}

if (Number(payload.featuredLimit) < 1 || Number(payload.featuredLimit) > 12) {
  errors.push('featuredLimit must be between 1 and 12');
}

if (errors.length) {
  console.error(`Data validation failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

const featured = payload.projects.filter((project) => project.featured).map((project) => project.displayName || project.name);
console.log(`Validated ${payload.projects.length} explicitly public projects across ${manifest.files.length} data files.`);
console.log(`Featured (${featured.length}): ${featured.join(', ')}`);
console.log(`Validated ${contributionPayload.contributions.length} contribution facts with ${contributionPayload.contributions.filter((item) => item.impactReceipt).length} verified impact receipts.`);
