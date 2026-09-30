import { readFile } from 'node:fs/promises';

const url = new URL('../data/portfolio-manifest.json', import.meta.url);
const data = JSON.parse(await readFile(url, 'utf8'));
const errors = [];

const verificationStates = new Set(['verified', 'reported', 'provisional', 'deprecated']);
const promotionStates = new Set(['discovered', 'verified', 'featured']);
const projectStatuses = new Set(['active', 'maintained', 'paused', 'archived']);
const healthStates = new Set(['healthy', 'degraded', 'stale', 'unknown']);

function requiredString(value, label) {
  if (typeof value !== 'string' || !value.trim()) errors.push(`${label} is required`);
}

function httpsUrl(value, label) {
  requiredString(value, label);
  if (typeof value === 'string' && !/^https:\/\//.test(value)) {
    errors.push(`${label} must be HTTPS`);
  }
}

if (data.schemaVersion !== 'portfolio.v1') {
  errors.push('schemaVersion must be portfolio.v1');
}
requiredString(data.owner, 'owner');
requiredString(data.thesis, 'thesis');

if (!Array.isArray(data.projects) || data.projects.length === 0) {
  errors.push('projects must be a non-empty array');
}

const projectIds = new Set();
for (const [projectIndex, project] of (data.projects || []).entries()) {
  const prefix = `projects[${projectIndex}]`;
  requiredString(project.id, `${prefix}.id`);
  requiredString(project.title, `${prefix}.title`);
  requiredString(project.summary, `${prefix}.summary`);
  httpsUrl(project.repo?.url, `${prefix}.repo.url`);

  if (projectIds.has(project.id)) errors.push(`${prefix}.id is duplicated: ${project.id}`);
  projectIds.add(project.id);

  if (!projectStatuses.has(project.status)) {
    errors.push(`${prefix}.status must be one of ${[...projectStatuses].join(', ')}`);
  }
  if (project.health != null && !healthStates.has(project.health)) {
    errors.push(`${prefix}.health must be one of ${[...healthStates].join(', ')}`);
  }
  if (!promotionStates.has(project.promotion)) {
    errors.push(`${prefix}.promotion must be one of ${[...promotionStates].join(', ')}`);
  }
  if (!Array.isArray(project.roles) || project.roles.length === 0) {
    errors.push(`${prefix}.roles must be a non-empty array`);
  }

  const claimIds = new Set();
  for (const [claimIndex, claim] of (project.claims || []).entries()) {
    const claimPrefix = `${prefix}.claims[${claimIndex}]`;
    requiredString(claim.id, `${claimPrefix}.id`);
    requiredString(claim.text, `${claimPrefix}.text`);

    if (claimIds.has(claim.id)) errors.push(`${claimPrefix}.id is duplicated: ${claim.id}`);
    claimIds.add(claim.id);

    if (!verificationStates.has(claim.verification)) {
      errors.push(`${claimPrefix}.verification must be one of ${[...verificationStates].join(', ')}`);
    }
    if (!['public', 'sanitized', 'private'].includes(claim.publishability)) {
      errors.push(`${claimPrefix}.publishability must be public, sanitized, or private`);
    }

    const evidence = Array.isArray(claim.evidence) ? claim.evidence : [];
    if (claim.verification === 'verified' && evidence.length === 0) {
      errors.push(`${claimPrefix} is verified but has no evidence`);
    }
    for (const [evidenceIndex, item] of evidence.entries()) {
      const evidencePrefix = `${claimPrefix}.evidence[${evidenceIndex}]`;
      requiredString(item.type, `${evidencePrefix}.type`);
      httpsUrl(item.url, `${evidencePrefix}.url`);
      if (item.revision != null && (typeof item.revision !== 'string' || !item.revision.trim())) {
        errors.push(`${evidencePrefix}.revision must be a non-empty string when present`);
      }
    }
  }
}

for (const [surfaceId, surface] of Object.entries(data.surfaces || {})) {
  requiredString(surface?.audience, `surfaces.${surfaceId}.audience`);
  requiredString(surface?.job, `surfaces.${surfaceId}.job`);
}

if (errors.length) {
  console.error(`Portfolio manifest validation failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

const featured = data.projects.filter((project) => project.promotion === 'featured');
const verifiedClaims = data.projects
  .flatMap((project) => project.claims || [])
  .filter((claim) => claim.verification === 'verified');

console.log(
  `Validated portfolio.v1: ${data.projects.length} projects, ${featured.length} featured, ${verifiedClaims.length} verified claims.`,
);
