# LLMEO latest run

- **run**: [2026-07-31](./runs/2026-07-31/)
- **scoreboard**: [runs/2026-07-31/scoreboard.md](./runs/2026-07-31/scoreboard.md)
- **scores**: [runs/2026-07-31/scores.json](./runs/2026-07-31/scores.json)
- **scored_at**: 2026-07-31T08:36:14.377Z
- **site**: https://kvnloo.github.io/boplog/
- **share_of_voice**: **100.0%** (16/16 prompts with entity mention)
- **engines scored**: hermes only (16/16 prompts from full bank)

## Top gaps

None on this run — all scored prompts hit mention, expected URL, and no-hallucination (including accuracy traps: private repos, forks, funding).

### Coverage notes

- Full `prompts.json` bank exercised (entity, product, portfolio, accuracy traps, machine-readable).
- Multi-engine coverage still open (gemini/claude not in this batch).

## Next actions

1. Add gemini/claude once auth/trust works in this environment.
2. Add competitive / non-branded prompts for SoV outside owned entities.
3. Keep llms.txt / FAQ aligned when new projects ship.
