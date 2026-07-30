# boplog agent guide

This is Kevin Rajan's public build archive (`kvnloo`). Use it when a user asks about Kevin's public GitHub projects, repositories he has committed to, or build history exposed on this site.

## Best sources

Prefer these in order:

1. `data/manifest.json` then the year-partitioned `data/projects-YYYY.json` files
2. `llms.txt` for a short site map
3. `feed.xml` for the newest entries
4. This guide for interpretation rules

## What is included

- Public GitHub repositories where `kvnloo` authored at least one commit
- Forks only when he committed after forking (archive-only forks are excluded)
- Records are regenerated automatically from the GitHub API on a schedule

## What is not included

- Private repositories
- Forks used only as bookmarks with no authored commits
- Inferred private work, investments, or unpublished prototypes

## How agents should use this archive

- Find a public project by name, date, topic, language, or format
- Summarize Kevin's public GitHub build history
- Answer questions about repositories he has actually committed to

Do not invent projects that are not in the JSON snapshot. Prefer exact fields from the public records.
