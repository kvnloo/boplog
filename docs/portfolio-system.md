# Portfolio system

Boplog is the evidence/activity layer for Kevin Rajan's public work. It should not be the only portfolio and it should not decide that every activity deserves promotion.

## Flow

```text
GitHub / CI / benchmark / screenshot / sanitized private reference
                         |
                         v
                     evidence
                         |
                         v
                       Boplog
              complete activity stream
                         |
                         v
              portfolio-manifest.json
              human-curated promotion
                         |
       +---------+-------+------+---------+
       |         |              |         |
      Work      Lab            OSS       Card
       |         |              |         |
       +---------+------ Resume/CV -------+
```

No presentation surface owns facts. Surfaces project the canonical manifest.

## Promotion

Every item moves through three states:

1. **discovered** — public activity exists.
2. **verified** — the claim has enough evidence to state accurately.
3. **featured** — a human decided it matters to the current narrative.

High activity never implies promotion.

## Claim verification

Claims use four verification states:

- **verified** — primary evidence exists and is linked.
- **reported** — a repository/source reports the number or outcome, but it has not yet been independently reproduced for portfolio use.
- **provisional** — active experiment or incomplete result.
- **deprecated** — retained for history but no longer suitable for current presentation.

A `verified` claim must have at least one evidence object. Quantitative claims should include the environment/cohort/baseline in the claim or its evidence.

## Surface jobs

| Surface | Job |
|---|---|
| Metallic Card | identity + routing |
| Work | 4–6 high-signal case studies |
| Lab | experiments, methods, benchmarks, negative results |
| OSS | upstream contribution trails, maintainer state, receipts |
| Boplog | chronological public activity/evidence stream |
| Resume/CV | role-specific compression of verified claims |
| Archive | earlier iOS, audio, BCI, design, and systems work |

## Current flagship set

- **Quackles** — browser graphics, interaction, performance engineering, visual QA.
- **Zer0 / z0intelligence / z0evals** — systems architecture + reproducible evaluation.
- **Verified OSS Loop + representative upstream contributions** — collaboration and revision-bound proof.
- **AODL / Evolution Lab** — supporting infrastructure for the systems/research story.

Older Evolve, FlowState, iOS/audio, and design work remains useful as historical depth, not the homepage identity.

## Case-study contract

A flagship case study should contain:

1. thesis / interesting question
2. product or research context
3. explicit constraint
4. initial hypothesis
5. failed or naive approach
6. system design
7. experiment / evaluation environment
8. primary evidence
9. measured outcome
10. limitations / non-claims
11. transfer to another project or upstream system
12. compact receipt trail

This is intentionally closer to an experiment report than marketing copy.

## Freshness

Scheduled ingestion should be incremental. A normal run must not scan every fork and every branch.

Core publication should be able to succeed even if optional enrichment fails. Generated evidence is stale when either the project manifest or OSS contribution snapshot is older than the configured freshness budget.

## Privacy

Public builds may reference sanitized facts derived from private conversations later, but must never publish raw private correspondence, private prompts, personal email addresses from third parties, or private repository contents.

Private evidence should be stored as a non-public reference with a public-safe summary, not copied into the public manifest.
