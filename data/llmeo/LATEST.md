# LLMEO latest runs

## Primary: full bank (hermes)

- **run**: [2026-07-31T09-18-27-merged](./runs/2026-07-31T09-18-27-merged/)
- **scoreboard**: [runs/2026-07-31T09-18-27-merged/scoreboard.md](./runs/2026-07-31T09-18-27-merged/scoreboard.md)
- **share_of_voice**: **100%** (20/20 prompts)
- **engines**: hermes
- **coverage**: full bank — branded, accuracy traps, **competitive** (4)

## Multi-engine sample (competitive only)

- **run**: [2026-07-31T09-18-28](./runs/2026-07-31T09-18-28/)
- **scoreboard**: [runs/2026-07-31T09-18-28/scoreboard.md](./runs/2026-07-31T09-18-28/scoreboard.md)
- **hermes**: 4/4 competitive prompts hit
- **claude**: auth skip (`Not logged in · Please run /login`)
- **gemini**: CLI exits 1 (folder trust / auth — no usable answer text)

## Next actions

1. Log in `claude` / trust + auth `gemini` in this environment, re-run multi-engine competitive.
2. Keep competitive prompts short (open-ended ones timed out at 90–150s on hermes).
3. Refresh llms.txt / FAQ when products change.
