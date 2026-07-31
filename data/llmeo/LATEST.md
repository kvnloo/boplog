# LLMEO latest run

- **run**: [2026-07-31](./runs/2026-07-31/)
- **scoreboard**: [runs/2026-07-31/scoreboard.md](./runs/2026-07-31/scoreboard.md)
- **scores**: [runs/2026-07-31/scores.json](./runs/2026-07-31/scores.json)
- **scored_at**: 2026-07-31T07:24:20.666Z
- **site**: https://kvnloo.github.io/boplog/
- **share_of_voice**: **100.0%** (6/6 prompts with entity mention)
- **engines scored**: hermes (6 results; gemini listed in raw but not present in results)

## Top gaps

None on this run — all scored prompts hit mention, expected URL, and no-hallucination.

### Coverage notes

- Only entity/product prompts were in this probe batch (6 prompts). Accuracy-trap and competitive prompts from `prompts.json` were not exercised.
- Expand the next probe to include accuracy traps (funding, private repos, forks) and multi-engine coverage (gemini) to validate hallucination resistance and SoV breadth.
- Product URLs and boplog/llms.txt extractability look healthy for hermes on this set.

## Next actions

1. Re-probe with full prompt bank (accuracy traps + competitive).
2. Ensure gemini (and other engines) produce results, not only hermes.
3. Keep llms.txt / FAQ aligned when new projects ship.
