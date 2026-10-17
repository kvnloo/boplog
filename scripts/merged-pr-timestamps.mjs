// Exact merge evidence in bounded GitHub GraphQL pages.
// GitHub's issue search objects don't guarantee merged_at. Fetching
// GET /repos/{owner}/{repo}/pulls/{number} for every merged PR exhausts
// the scheduled workflow's repository installation rate bucket.
export const MERGED_PR_QUERY = [
  'query($query: String!, $after: String) {',
  '  search(query: $query, type: ISSUE, first: 100, after: $after) {',
  '    issueCount',
  '    pageInfo { hasNextPage endCursor }',
  '    nodes { ... on PullRequest { number mergedAt repository { nameWithOwner } } }',
  '  }',
  '}',
].join('\n');

export function mergedPrKey(repo, number) {
  if (typeof repo !== 'string' || !repo.includes('/') || !Number.isInteger(number) || number < 1) {
    throw new Error('invalid merged PR identifier');
  }
  return repo.toLowerCase() + '#' + number;
}

export async function collectMergedAt(query, request, maxPages = 10) {
  if (typeof query !== 'string' || !query.includes('is:merged')) {
    throw new Error('merge evidence requires an is:merged search query');
  }
  const dates = new Map();
  let after = null;
  let capped = false;
  for (let page = 1; page <= maxPages; page += 1) {
    const response = await request('/graphql', 0, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: MERGED_PR_QUERY,
        variables: { query: query + ' sort:updated-desc', after },
      }),
    });
    if (response.errors?.length) {
      throw new Error('GitHub GraphQL merge evidence: ' + response.errors.map((error) => error.message).join('; '));
    }
    const search = response.data?.search;
    if (!search || !Array.isArray(search.nodes) || !search.pageInfo) {
      throw new Error('GitHub GraphQL merge evidence missing search nodes/pageInfo');
    }
    capped ||= Number(search.issueCount) > 1000;
    for (const node of search.nodes) {
      if (!node?.repository?.nameWithOwner || !node?.number || !node.mergedAt) {
        throw new Error('GitHub GraphQL returned a merged PR without exact public merge evidence');
      }
      const key = mergedPrKey(node.repository.nameWithOwner, node.number);
      if (dates.has(key) && dates.get(key) !== node.mergedAt) {
        throw new Error('Conflicting mergedAt for ' + key);
      }
      dates.set(key, node.mergedAt);
    }
    if (!search.pageInfo.hasNextPage) {
      return { dates, capped };
    }
    if (!search.pageInfo.endCursor) {
      throw new Error('GitHub GraphQL pagination missing endCursor');
    }
    after = search.pageInfo.endCursor;
  }
  return { dates, capped: true };
}

export function exactMergedAt(item, dates) {
  const repo = item.repository_url?.split('/repos/')[1];
  const date = dates.get(mergedPrKey(repo, item.number));
  if (!date || !Number.isFinite(Date.parse(date))) {
    throw new Error('Missing exact mergedAt for ' + repo + '#' + item.number + '; refusing to publish inaccurate status');
  }
  return date;
}
