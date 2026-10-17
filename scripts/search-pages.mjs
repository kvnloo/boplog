// Paginate GitHub Search without silently dropping results at its 1,000-item cap.
// A capped query is recursively split into non-overlapping created-date ranges.
// All requests are sequential so the independent Search rate bucket can recover.
const DAY_MS = 86_400_000;
const day = (ms) => new Date(ms).toISOString().slice(0, 10);

export async function collectSearchRecords(query, request) {
  const start = Date.UTC(2008, 0, 1);
  const end = Date.UTC(new Date().getUTCFullYear(), 11, 31);
  const limit = 1000;
  let incomplete = false;
  const cappedRanges = [];

  async function scan(firstDay, lastDay) {
    const ranged = firstDay == null ? query : query + ' created:' + day(firstDay) + '..' + day(lastDay);
    const url = (page) => '/search/issues?q=' + encodeURIComponent(ranged)
      + '&sort=updated&order=desc&per_page=100&page=' + page;
    const first = await request(url(1));
    if (!Array.isArray(first.items) || !Number.isInteger(first.total_count)) {
      throw new Error('GitHub Search returned invalid pagination evidence for ' + ranged);
    }
    incomplete ||= Boolean(first.incomplete_results);
    if (first.total_count > limit) {
      if (firstDay == null) return scan(start, end);
      if (firstDay >= lastDay) {
        cappedRanges.push(ranged);
        return first.items;
      }
      const midpoint = firstDay + Math.floor((lastDay - firstDay) / DAY_MS / 2) * DAY_MS;
      const left = await scan(firstDay, midpoint);
      const right = await scan(midpoint + DAY_MS, lastDay);
      return [...left, ...right];
    }

    const result = [...first.items];
    for (let page = 2; page <= Math.ceil(first.total_count / 100); page += 1) {
      const next = await request(url(page));
      if (!Array.isArray(next.items)) throw new Error('Missing GitHub Search page ' + page);
      incomplete ||= Boolean(next.incomplete_results);
      result.push(...next.items);
    }
    return result;
  }

  const records = await scan(null, null);
  const deduped = [...new Map(records.map((item) => [item.html_url, item])).values()];
  return {
    records: deduped,
    capped: cappedRanges.length > 0 || incomplete,
    limitations: [
      ...cappedRanges.map((range) => 'Search date-partition cap for ' + range),
      ...(incomplete ? ['GitHub Search returned incomplete_results'] : []),
    ],
  };
}
