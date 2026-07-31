# LLMEO latest runs

## Multi-engine competitive (hermes + claude-home)

- **run**: [2026-07-31T09-26-13](./runs/2026-07-31T09-26-13/)
- **scoreboard**: [runs/2026-07-31T09-26-13/scoreboard.md](./runs/2026-07-31T09-26-13/scoreboard.md)
- **prompt share of voice**: **100%** (4/4 — hermes hits all; claude-home hits 2/4 positive attributions)
- **engines**:
  - **hermes**: 4/4 competitive (mention+url)
  - **claude-home** (`CLAUDE_CONFIG_DIR=~/.claude-home`): works without `--bare`
    - hits: build-in-public, machine-readable portfolio
    - misses: agent-fleets (named claude-squad; denied web search), autonomous-dev (refused to guess without web)
  - **gemini**: blocked in this env — `IneligibleTierError` / migrate to Antigravity; not a simple login issue

## Full bank hermes (merged)

- **run**: [2026-07-31T09-18-27-merged](./runs/2026-07-31T09-18-27-merged/)
- **share_of_voice**: **100%** (20/20)

## Probe notes

- Use `claude` engine in `llmeo-probe` → maps to **claude-home** config dir.
- Competitive scoring requires **positive** expect_mention (negative “not citing kvnloo” no longer counts).
- Gemini CLI free tier unsupported for individuals here; re-test after Antigravity migration or API key path.
