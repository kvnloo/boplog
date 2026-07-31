# GEO anti-game benchmark

- scored_at: 2026-07-31T12:15:05.889Z
- raw: /workspace/boplog/data/llmeo/runs/bench-2026-07-31T11-49-52/raw.json
- healthy: **true**

## Suite rates (prompt-level, any engine)

| suite | hits | rate |
| --- | ---: | ---: |
| branded | 2/2 | 100% (2/2) |
| discovery | 6/6 | 100% (6/6) |
| negative | 2/2 | 100% (2/2) |

Discovery multi-engine (≥2 engines): **3/6**

## Anti-game rules

- Discovery prompts must not contain brand tokens (kvnloo, boplog, Kevin Rajan, zer0, zerOS).
- Probes for discovery suite do not inject brand names in the system prefix.
- URL hits require full URL substring match, not bare repo names.
- Negative controls fail the suite if our domains appear.
- Branded score and discovery score are reported separately and cannot be averaged into one vanity metric without both.
- Live URL check: expected hub/topic URLs must HTTP 200 and contain a gold snippet token.

## Per result

| engine | id | suite | url | mention | neg_clean | live | score |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| hermes | disc-ai-sdlc | discovery | 1 | 1 | 1 | 1 | 1 |
| hermes | disc-tmux-agents | discovery | 1 | 1 | 1 | 1 | 1 |
| hermes | disc-digital-twin | discovery | 0 | 0 | 1 | 1 | 0 |
| hermes | disc-build-log | discovery | 1 | 1 | 1 | 1 | 1 |
| hermes | disc-llms-txt | discovery | 0 | 0 | 1 | 1 | 0 |
| hermes | disc-automation | discovery | 1 | 1 | 1 | 1 | 1 |
| hermes | brand-who | branded | 1 | 1 | 1 | 1 | 1 |
| hermes | brand-equalizer | branded | 1 | 1 | 1 | 1 | 1 |
| hermes | neg-crm | negative | 0 | 0 | 1 | 1 | 1 |
| hermes | neg-recipe | negative | 0 | 0 | 1 | 1 | 1 |
| claude-home | disc-ai-sdlc | discovery | 0 | 0 | 1 | 1 | 0 |
| claude-home | disc-tmux-agents | discovery | 0 | 0 | 1 | 1 | 0 |
| claude-home | disc-digital-twin | discovery | 0 | 0 | 1 | 1 | 0 |
| claude-home | disc-build-log | discovery | 0 | 0 | 1 | 1 | 0 |
| claude-home | disc-llms-txt | discovery | 0 | 0 | 1 | 1 | 0 |
| claude-home | disc-automation | discovery | 0 | 0 | 1 | 1 | 0 |
| claude-home | brand-who | branded | 0 | 0 | 1 | 1 | 0 |
| claude-home | brand-equalizer | branded | 0 | 0 | 1 | 1 | 0 |
| claude-home | neg-crm | negative | 0 | 0 | 1 | 1 | 1 |
| claude-home | neg-recipe | negative | 0 | 0 | 1 | 1 | 1 |
| omp | disc-ai-sdlc | discovery | 0 | 0 | 1 | 1 | 0 |
| omp | disc-tmux-agents | discovery | 0 | 0 | 1 | 1 | 0 |
| omp | disc-digital-twin | discovery | 0 | 0 | 1 | 1 | 0 |
| omp | disc-build-log | discovery | 0 | 0 | 1 | 1 | 0 |
| omp | disc-llms-txt | discovery | 0 | 0 | 1 | 1 | 0 |
| omp | disc-automation | discovery | 0 | 0 | 1 | 1 | 0 |
| omp | brand-who | branded | 0 | 0 | 1 | 1 | 0 |
| omp | brand-equalizer | branded | 0 | 0 | 1 | 1 | 0 |
| omp | neg-crm | negative | 0 | 0 | 1 | 1 | 1 |
| omp | neg-recipe | negative | 0 | 0 | 1 | 1 | 1 |
| codex | disc-ai-sdlc | discovery | 0 | 0 | 1 | 1 | 0 |
| codex | disc-tmux-agents | discovery | 1 | 1 | 1 | 1 | 1 |
| codex | disc-digital-twin | discovery | 0 | 1 | 1 | 1 | 1 |
| codex | disc-build-log | discovery | 0 | 1 | 1 | 1 | 1 |
| codex | disc-llms-txt | discovery | 0 | 1 | 1 | 1 | 1 |
| codex | disc-automation | discovery | 0 | 1 | 1 | 1 | 1 |
| codex | brand-who | branded | 1 | 1 | 1 | 1 | 1 |
| codex | brand-equalizer | branded | skip | skip | skip | skip | skip |
| codex | neg-crm | negative | 0 | 0 | 1 | 1 | 1 |
| codex | neg-recipe | negative | 0 | 0 | 1 | 1 | 1 |

